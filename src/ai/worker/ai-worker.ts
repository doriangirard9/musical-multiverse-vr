// ─── ai-worker.ts ────────────────────────────────────────────────────────────
//
//   Point d'entrée du Web Worker qui fait tourner l'inférence du modèle HORS
//   du thread principal.  Le rendu Babylon/XR reste libre → plus de lag VR.
//
//   Backend TF.js : WASM (CPU SIMD).  Choisi car il tourne nativement dans un
//   worker (pas besoin d'OffscreenCanvas comme WebGL).  Si la latence WASM est
//   trop élevée, on basculera sur WebGL + OffscreenCanvas (prochaine itération).
//
//   IMPORTANT — instance TF.js unique :
//   Magenta embarque son propre TF.js (mm.tf).  Le backend WASM doit être
//   enregistré sur CETTE instance, sinon Magenta ne le voit pas.  Comme
//   @tensorflow/tfjs-core@2.8.6 est dédupliqué par npm, l'import du backend
//   wasm s'enregistre sur la même instance que celle de Magenta.  On force
//   ensuite tf.setBackend('wasm').
//
//   Le worker réutilise le MagentaMusicRNNAdapter EXISTANT tel quel — c'est
//   tout l'intérêt de l'adapter pattern : aucune logique de génération
//   dupliquée, juste un changement de thread.

// ⚠ Doit rester EN PREMIER : aliase window→globalThis avant que TF.js/Magenta charge.
import "./worker-polyfill";
import * as tf from "@tensorflow/tfjs";
import { setWasmPaths } from "@tensorflow/tfjs-backend-wasm";
import { MagentaMusicRNNAdapter } from "../adapters/MagentaMusicRNNAdapter";
import type { MagentaRNNVariant } from "../adapters/MagentaMusicRNNAdapter";
import { MusicVAEAdapter } from "../adapters/MusicVAEAdapter";
import type { IMusicGeneratorAdapter } from "../IMusicGeneratorAdapter";
import type { MidiEvent, PatternNote } from "../types";

export type WorkerModelType = "music_rnn" | "music_vae";

// Backend TF.js choisi par l'appelant.
//   cpu  : couverture complète des kernels (dont Multinomial), lent mais
//          tourne dans le worker → ne bloque pas le main thread. DÉFAUT.
//   wasm : plus rapide MAIS il MANQUE le kernel Multinomial en TF.js 2.8.6
//          → MusicRNN échoue. Gardé pour comparaison/documentation seulement.
//   (webgl nécessiterait OffscreenCanvas — itération suivante si CPU trop lent.)
export type WorkerBackend = "cpu" | "wasm";

async function setupBackend(backend: WorkerBackend): Promise<void> {
    if (backend === "wasm") {
        setWasmPaths("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@2.8.6/dist/");
    }
    await tf.setBackend(backend);
    await tf.ready();
}

// ─── Protocole de messages ───────────────────────────────────────────────────

type InMessage =
    | { type: "init"; requestId: number; modelType: WorkerModelType; variant: MagentaRNNVariant; primerMaxNotes: number; backend: WorkerBackend }
    | { type: "setHyperparameter"; name: string; value: number }
    | { type: "setMeter"; numerator: number; denominator: number }
    | { type: "requestNext"; requestId: number; context: MidiEvent[]; dtMs: number }
    | { type: "generatePattern"; requestId: number; seed: PatternNote[]; seedSteps: number; genSteps: number; temperature: number }
    | { type: "dispose"; requestId: number };

type OutMessage =
    | { type: "ready" }                                                  // worker chargé
    | { type: "initDone"; requestId: number; initTimeMs: number; backend: string }
    | { type: "notes"; requestId: number; events: MidiEvent[]; inferenceMs: number }
    | { type: "pattern"; requestId: number; notes: PatternNote[]; inferenceMs: number }
    | { type: "disposeDone"; requestId: number }
    | { type: "error"; requestId: number; message: string };

let adapter: IMusicGeneratorAdapter | null = null;

function post(msg: OutMessage) {
    (self as any).postMessage(msg);
}

self.onmessage = async (e: MessageEvent<InMessage>) => {
    const msg = e.data;

    try {
        switch (msg.type) {
            case "init": {
                const t0 = performance.now();

                // Backend choisi par l'appelant (cpu par défaut, cf WebWorkerAdapter)
                await setupBackend(msg.backend);

                // Choix de l'adapter selon le type de modèle (Famille 1 ou 2)
                adapter = msg.modelType === "music_vae"
                    ? new MusicVAEAdapter()
                    : new MagentaMusicRNNAdapter({
                        variant: msg.variant,
                        primerMaxNotes: msg.primerMaxNotes,
                    });
                await adapter.init();

                post({
                    type: "initDone",
                    requestId: msg.requestId,
                    initTimeMs: performance.now() - t0,
                    backend: tf.getBackend(),
                });
                break;
            }

            case "setHyperparameter": {
                // Fire-and-forget : pas de requestId, pas de réponse.
                adapter?.setHyperparameter(msg.name, msg.value);
                break;
            }

            case "setMeter": {
                // Fire-and-forget. No-op si l'adapter n'implémente pas setMeter.
                adapter?.setMeter?.(msg.numerator, msg.denominator);
                break;
            }

            case "requestNext": {
                if (!adapter) throw new Error("worker: adapter non initialisé");
                const t0 = performance.now();
                const events = await adapter.requestNext(msg.context, msg.dtMs);
                post({
                    type: "notes",
                    requestId: msg.requestId,
                    events,
                    inferenceMs: performance.now() - t0,
                });
                break;
            }

            case "generatePattern": {
                if (!adapter) throw new Error("worker: adapter non initialisé");
                if (adapter.generatePattern === undefined) throw new Error("worker: adapter does not support generatePattern");
                const t0 = performance.now();
                const notes = await adapter.generatePattern(msg.seed, msg.seedSteps, msg.genSteps, msg.temperature);
                post({
                    type: "pattern",
                    requestId: msg.requestId,
                    notes,
                    inferenceMs: performance.now() - t0,
                });
                break;
            }

            case "dispose": {
                await adapter?.dispose();
                adapter = null;
                post({ type: "disposeDone", requestId: msg.requestId });
                break;
            }
        }
    } catch (err: any) {
        const requestId = "requestId" in msg ? (msg as any).requestId : -1;
        post({ type: "error", requestId, message: err?.stack || err?.message || String(err) });
    }
};

// Signaler que le worker est chargé et prêt à recevoir "init".
post({ type: "ready" });
