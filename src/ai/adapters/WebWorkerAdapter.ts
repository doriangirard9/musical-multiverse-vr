import {
    IMusicGeneratorAdapter, AdapterCapabilities, AdapterTier,
} from "../IMusicGeneratorAdapter";
import {
    MidiEvent, AdapterStats, InitOpts, emptyStats,
} from "../types";
import type { MagentaRNNVariant } from "./MagentaMusicRNNAdapter";
import { RNN_HYPERPARAMS, VAE_HYPERPARAMS } from "../hyperparams";

// Type de modèle exécuté dans le worker (Famille 1 = RNN, Famille 2 = VAE).
export type WorkerModelType = "music_rnn" | "music_vae";

// ─── WebWorkerAdapter ────────────────────────────────────────────────────────
//
//   Adapter qui implémente IMusicGeneratorAdapter sur le THREAD PRINCIPAL mais
//   délègue toute l'inférence à un Web Worker.  Résout le lag VR : l'inférence
//   TF.js ne bloque plus le rendu Babylon/XR.
//
//   Élégance de l'adapter pattern : ni le scheduler ni l'AIComposerN3D ne
//   changent.  On échange juste l'adapter direct (MagentaMusicRNNAdapter) contre
//   celui-ci, qui parle au worker.  Le worker, lui, réutilise le
//   MagentaMusicRNNAdapter tel quel.
//
//   Communication : requestId → resolver. Chaque requestNext/init renvoie une
//   promesse résolue quand le worker répond avec le bon requestId.
//
//   Les hyperparamètres sont mis en cache côté main (pour getHyperparameter
//   synchrone) ET postés au worker (fire-and-forget).

export type WorkerBackend = "cpu" | "wasm";

export interface WebWorkerAdapterOpts extends InitOpts {
    /** Type de modèle dans le worker. Défaut "music_rnn". */
    modelType?: WorkerModelType;
    variant?: MagentaRNNVariant;
    primerMaxNotes?: number;
    /**
     * Backend TF.js dans le worker.
     *   "cpu"  : DÉFAUT. Couverture complète des kernels (Multinomial inclus),
     *            lent mais hors main thread → pas de lag VR.
     *   "wasm" : plus rapide mais MANQUE Multinomial en TF.js 2.8.6 → casse
     *            MusicRNN. Gardé pour comparaison seulement.
     */
    backend?: WorkerBackend;
}

export class WebWorkerAdapter implements IMusicGeneratorAdapter {
    readonly id: string;
    readonly displayName: string;
    readonly tier: AdapterTier = "local-browser";

    readonly capabilities: AdapterCapabilities;

    readonly stats: AdapterStats = emptyStats();

    /** Backend TF.js effectivement utilisé par le worker (rempli à l'init). */
    public backend = "?";

    private modelType: WorkerModelType;
    private variant: MagentaRNNVariant;
    private primerMaxNotes: number;
    private requestedBackend: WorkerBackend;

    private worker: Worker | null = null;
    private nextRequestId = 1;
    private pendingResolvers = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
    private readyPromise: Promise<void> | null = null;
    private readyResolve: (() => void) | null = null;

    private hypers = new Map<string, number>();
    private meter = { numerator: 4, denominator: 4 };   // signature rythmique de l'hôte
    private latencies: number[] = [];

    constructor(opts: WebWorkerAdapterOpts = {}) {
        this.modelType = opts.modelType ?? "music_rnn";
        this.variant = opts.variant ?? "melody_rnn";
        this.primerMaxNotes = opts.primerMaxNotes ?? 8;
        this.requestedBackend = opts.backend ?? "cpu";

        // Capabilities selon le type de modèle (specs partagées, pures données).
        const specs = this.modelType === "music_vae" ? VAE_HYPERPARAMS : RNN_HYPERPARAMS;
        this.capabilities = {
            streaming: true,
            hyperparameters: specs,
            inputModality: "midi-context",
            outputModality: "midi-events",
        };

        const tag = this.modelType === "music_vae" ? "vae" : this.variant;
        this.id = `webworker-${tag}`;
        this.displayName = `WebWorker (${tag})`;
        for (const h of specs) this.hypers.set(h.name, h.default);
    }

    async init(opts?: InitOpts): Promise<void> {
        const t0 = performance.now();
        opts?.progressCallback?.(0);

        // Créer le worker (Vite gère le bundling via new URL + import.meta.url)
        this.worker = new Worker(
            new URL("../worker/ai-worker.ts", import.meta.url),
            { type: "module" },
        );

        // Attendre le message "ready" du worker
        this.readyPromise = new Promise<void>((res) => { this.readyResolve = res; });
        this.worker.onmessage = (e) => this.onWorkerMessage(e);
        this.worker.onerror = (e) => {
            console.error("[WebWorkerAdapter] worker error:", e.message);
            // Rejeter toutes les requêtes en attente
            for (const { reject } of this.pendingResolvers.values()) reject(new Error(e.message));
            this.pendingResolvers.clear();
        };

        await this.readyPromise;
        opts?.progressCallback?.(0.3);

        // Envoyer l'init et attendre la confirmation
        const result = await this.request<{ initTimeMs: number; backend: string }>(
            (requestId) => ({ type: "init", requestId, modelType: this.modelType, variant: this.variant, primerMaxNotes: this.primerMaxNotes, backend: this.requestedBackend }),
        );
        this.backend = result.backend;

        // Pousser les hyperparamètres par défaut au worker
        for (const [name, value] of this.hypers) {
            this.worker.postMessage({ type: "setHyperparameter", name, value });
        }
        // Pousser la signature rythmique courante (mise en cache avant init)
        this.worker.postMessage({ type: "setMeter", numerator: this.meter.numerator, denominator: this.meter.denominator });

        opts?.progressCallback?.(1);
        this.stats.initTimeMs = performance.now() - t0;
        console.log(`[WebWorkerAdapter] prêt — backend=${this.backend}, init=${this.stats.initTimeMs.toFixed(0)} ms`);
    }

    async dispose(): Promise<void> {
        if (this.worker) {
            try { await this.request((requestId) => ({ type: "dispose", requestId })); } catch (_) {}
            this.worker.terminate();
            this.worker = null;
        }
        this.pendingResolvers.clear();
        this.latencies.length = 0;
    }

    setHyperparameter(name: string, value: number): void {
        const spec = this.capabilities.hyperparameters.find(h => h.name === name);
        if (!spec) throw new Error(`WebWorkerAdapter: unknown hyperparameter "${name}"`);
        if (value < spec.min || value > spec.max) {
            throw new Error(`WebWorkerAdapter: ${name}=${value} out of range [${spec.min}, ${spec.max}]`);
        }
        this.hypers.set(name, value);                                       // cache main
        this.worker?.postMessage({ type: "setHyperparameter", name, value }); // fire-and-forget
    }

    getHyperparameter(name: string): number {
        const v = this.hypers.get(name);
        if (v === undefined) throw new Error(`WebWorkerAdapter: unknown hyperparameter "${name}"`);
        return v;
    }

    setMeter(numerator: number, denominator: number): void {
        this.meter = { numerator, denominator };                                  // cache main
        this.worker?.postMessage({ type: "setMeter", numerator, denominator });   // fire-and-forget
    }

    async requestNext(context: readonly MidiEvent[], dtMs: number): Promise<MidiEvent[]> {
        if (!this.worker) {
            this.stats.failureCount++;
            throw new Error("WebWorkerAdapter: init() must be called before requestNext()");
        }
        const tStart = performance.now();
        try {
            const result = await this.request<{ events: MidiEvent[]; inferenceMs: number }>(
                (requestId) => ({ type: "requestNext", requestId, context: context as MidiEvent[], dtMs }),
            );
            // Latence mesurée côté MAIN = inférence worker + round-trip postMessage.
            // C'est la latence "vécue" par le scheduler, la bonne à mesurer.
            const latency = performance.now() - tStart;
            this.recordLatency(latency);
            this.stats.callCount++;
            this.updateAggregateStats();
            return result.events;
        } catch (e) {
            this.stats.failureCount++;
            throw e;
        }
    }

    // ── Plomberie worker ──────────────────────────────────────────────────

    private request<T>(build: (requestId: number) => any): Promise<T> {
        const requestId = this.nextRequestId++;
        return new Promise<T>((resolve, reject) => {
            this.pendingResolvers.set(requestId, { resolve, reject });
            this.worker!.postMessage(build(requestId));
        });
    }

    private onWorkerMessage(e: MessageEvent): void {
        const msg = e.data;
        switch (msg.type) {
            case "ready":
                this.readyResolve?.();
                break;
            case "initDone":
                this.resolveRequest(msg.requestId, { initTimeMs: msg.initTimeMs, backend: msg.backend });
                break;
            case "notes":
                this.resolveRequest(msg.requestId, { events: msg.events, inferenceMs: msg.inferenceMs });
                break;
            case "disposeDone":
                this.resolveRequest(msg.requestId, undefined);
                break;
            case "error": {
                const pending = this.pendingResolvers.get(msg.requestId);
                if (pending) {
                    pending.reject(new Error(msg.message));
                    this.pendingResolvers.delete(msg.requestId);
                } else {
                    console.error("[WebWorkerAdapter] worker error (orphan):", msg.message);
                }
                break;
            }
        }
    }

    private resolveRequest(requestId: number, value: any): void {
        const pending = this.pendingResolvers.get(requestId);
        if (pending) {
            pending.resolve(value);
            this.pendingResolvers.delete(requestId);
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
