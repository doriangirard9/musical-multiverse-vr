import * as tf from "@tensorflow/tfjs";
import { MusicVAE } from "@magenta/music/esm/music_vae";
import {
    IMusicGeneratorAdapter, AdapterCapabilities, AdapterTier,
} from "../IMusicGeneratorAdapter";
import { MidiEvent, AdapterStats, InitOpts, emptyStats } from "../types";
import { VAE_HYPERPARAMS } from "../hyperparams";
import { notesToMidiEvents, notesEndStep } from "./noteConversion";

// ─── MusicVAEAdapter (Famille 2 — espace latent) ─────────────────────────────
//
//   MusicVAE encode une phrase dans un vecteur LATENT, et décode un vecteur
//   latent vers une phrase. Ce n'est PAS un modèle de continuation (≠ MusicRNN).
//
//   Idée "chef d'orchestre" : on fixe DEUX phrases-ancres (A et B), on récupère
//   leurs vecteurs latents zA et zB, et l'hyperparamètre `morph` (0..1) interpole
//   entre eux. Décoder lerp(zA, zB, morph) → une phrase qui MORPHE continûment
//   entre A et B. Le geste = position dans l'espace latent = caractère musical.
//
//   Streaming via le scheduler : requestNext décode une phrase 2-mesures (~4 s)
//   au morph courant et renvoie tous ses événements. Le scheduler bufferise.
//   Un changement de morph prend effet à la phrase suivante (latence ≈ une
//   phrase) — cohérent avec le modèle "contrôle de caractère = bufferisé".
//
//   Imports ciblés (music_vae, pas le barrel) pour éviter l'OfflineAudioContext.

const CHECKPOINT_URL =
    "https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_2bar_small";
const STEPS_PER_QUARTER = 4;
const DEFAULT_BPM = 120;
const MS_PER_STEP = 60_000 / (DEFAULT_BPM * STEPS_PER_QUARTER);   // 125 ms
const PHRASE_STEPS = 32;   // mel_2bar = 2 mesures de 16 steps — durée FIXE de phrase

export interface MusicVAEAdapterOpts extends InitOpts {
    checkpointUrl?: string;
}

export class MusicVAEAdapter implements IMusicGeneratorAdapter {
    readonly id = "magenta-music-vae-mel2bar";
    readonly displayName = "Magenta MusicVAE (mel_2bar)";
    readonly tier: AdapterTier = "local-browser";

    readonly capabilities: AdapterCapabilities = {
        streaming: true,
        hyperparameters: VAE_HYPERPARAMS,
        inputModality: "midi-context",
        outputModality: "midi-events",
    };

    readonly stats: AdapterStats = emptyStats();

    private vae: MusicVAE | null = null;
    private checkpointUrl: string;
    private zA: number[] = [];      // vecteur latent de l'ancre A
    private zB: number[] = [];      // vecteur latent de l'ancre B
    private hypers = new Map<string, number>();
    private latencies: number[] = [];
    /** Silence de queue de la phrase précédente (ms), reporté sur le premier
     *  delta de la suivante — sans lui, les phrases de 2 mesures se collent
     *  et la pulsation se compresse à chaque frontière (cf. noteConversion). */
    private padCarryMs = 0;

    constructor(opts: MusicVAEAdapterOpts = {}) {
        this.checkpointUrl = opts.checkpointUrl ?? CHECKPOINT_URL;
        for (const h of VAE_HYPERPARAMS) this.hypers.set(h.name, h.default);
    }

    async init(opts?: InitOpts): Promise<void> {
        const t0 = performance.now();
        try {
            opts?.progressCallback?.(0);
            this.vae = new MusicVAE(this.checkpointUrl);
            await this.vae.initialize();
            opts?.progressCallback?.(0.6);

            // Deux phrases-ancres aléatoires → leurs vecteurs latents.
            const anchors = await this.vae.sample(2, 1.0);
            const zT = await this.vae.encode(anchors);          // Tensor2D [2, D]
            const zArr = (await zT.array()) as number[][];
            zT.dispose();
            this.zA = zArr[0];
            this.zB = zArr[1];

            opts?.progressCallback?.(1);
            this.stats.initTimeMs = performance.now() - t0;
        } catch (e) {
            this.stats.initTimeMs = performance.now() - t0;
            this.stats.failureCount++;
            throw e;
        }
    }

    async dispose(): Promise<void> {
        this.vae?.dispose();
        this.vae = null;
        this.latencies.length = 0;
        this.zA = [];
        this.zB = [];
    }

    setHyperparameter(name: string, value: number): void {
        const spec = VAE_HYPERPARAMS.find(h => h.name === name);
        if (!spec) throw new Error(`MusicVAEAdapter: unknown hyperparameter "${name}"`);
        if (value < spec.min || value > spec.max) {
            throw new Error(`MusicVAEAdapter: ${name}=${value} out of range [${spec.min}, ${spec.max}]`);
        }
        this.hypers.set(name, value);
    }

    getHyperparameter(name: string): number {
        const v = this.hypers.get(name);
        if (v === undefined) throw new Error(`MusicVAEAdapter: unknown hyperparameter "${name}"`);
        return v;
    }

    async requestNext(_context: readonly MidiEvent[], _dtMs: number): Promise<MidiEvent[]> {
        if (!this.vae) {
            this.stats.failureCount++;
            throw new Error("MusicVAEAdapter: init() must be called before requestNext()");
        }
        const tStart = performance.now();
        try {
            const t = this.hypers.get("morph")!;
            const temp = this.hypers.get("temperature")!;

            // Interpolation latente zMix = lerp(zA, zB, morph)
            const zMix = this.zA.map((a, i) => a * (1 - t) + this.zB[i] * t);
            const zTensor = tf.tensor2d([zMix]);                // [1, D]
            const seqs = await this.vae.decode(zTensor, temp);  // INoteSequence[]
            zTensor.dispose();

            const phrase = seqs[0];
            const notes = phrase.notes ?? [];
            const events = notesToMidiEvents(notes, {
                msPerStep: MS_PER_STEP,
                isDrums: false,
                octaveCenter: 60,
                pitchRange: 128,   // pas de repliement : le VAE sort déjà des hauteurs valides
                channel: 0,
            });

            // GRILLE CONTINUE inter-phrases : la phrase fait PHRASE_STEPS pile ;
            // le silence après la dernière note est reporté sur le premier
            // delta de la phrase suivante (même règle que le RNN).
            if (events.length > 0) {
                events[0].deltaMs += this.padCarryMs;
                const tailSteps = Math.max(0, PHRASE_STEPS - notesEndStep(notes));
                this.padCarryMs = tailSteps * MS_PER_STEP;
            } else {
                this.padCarryMs += PHRASE_STEPS * MS_PER_STEP;
            }

            const latency = performance.now() - tStart;
            this.recordLatency(latency);
            this.stats.callCount++;
            this.updateAggregateStats();
            return events;
        } catch (e) {
            this.stats.failureCount++;
            throw e;
        }
    }

    private recordLatency(ms: number): void {
        this.latencies.push(ms);
        if (this.latencies.length > 1000) this.latencies.shift();
    }

    private updateAggregateStats(): void {
        const lat = this.latencies;
        const n = lat.length;
        if (n === 0) return;
        let sum = 0;
        for (const v of lat) sum += v;
        this.stats.avgInferenceMs = sum / n;
        const sorted = [...lat].sort((a, b) => a - b);
        this.stats.p50InferenceMs = sorted[Math.floor(n * 0.50)];
        this.stats.p95InferenceMs = sorted[Math.floor(n * 0.95)];
        this.stats.p99InferenceMs = sorted[Math.min(n - 1, Math.floor(n * 0.99))];
        const mem = (performance as any).memory;
        if (mem && typeof mem.usedJSHeapSize === "number") {
            this.stats.memHeapBytes = mem.usedJSHeapSize;
        }
    }
}
