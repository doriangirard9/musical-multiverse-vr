import type { Scene } from "@babylonjs/core";
import type { MidiLookaheadScheduler } from "../scheduler/MidiLookaheadScheduler";
import type { IMusicGeneratorAdapter } from "../IMusicGeneratorAdapter";

// ─── PerfMonitor ─────────────────────────────────────────────────────────────
//
//   Instrumentation consolidée pour mesurer la réduction du lag VR.
//
//   Métrique CLÉ : les FRAME TIMES du thread principal.  Un gel de 150 ms
//   (inférence TF.js sur le main thread) se voit comme un frame time max de
//   150 ms et des "janky frames" (> 33 ms = sous 30 fps).  Quand l'inférence
//   passe dans un worker, le frame time max doit s'effondrer → preuve directe.
//
//   Hooke la boucle de rendu Babylon (onBeforeRenderObservable) et accumule
//   les deltas dans une fenêtre glissante.  Combine avec les stats du
//   scheduler et de l'adapter.  Logge une ligne consolidée toutes les N ms.
//
//   Comparaison avant/après :
//     • MagentaMusicRNNAdapter (main thread) → frame max ~150 ms, janky élevé
//     • WebWorkerAdapter        (worker)     → frame max ~16-20 ms, janky ~0

export interface PerfSnapshot {
    // Rendu (thread principal)
    fps: number;              // 1000 / avg frame time sur la fenêtre
    avgFrameMs: number;
    maxFrameMs: number;       // le plus long gel sur la fenêtre = LA métrique
    p95FrameMs: number;
    jankyFrames: number;      // frames > 33 ms (sous 30 fps) sur la fenêtre
    frameCount: number;

    // Adapter (inférence)
    adapterAvgMs: number;
    adapterP95Ms: number;
    adapterP99Ms: number;
    adapterCalls: number;
    adapterBackend: string;

    // Scheduler (flux)
    notesGenerated: number;
    notesPlayed: number;
    bufferDepthSec: number;
    lateEvents: number;
    lowBufferTicks: number;
}

export class PerfMonitor {
    private frameTimes: number[] = [];   // fenêtre glissante de deltas (ms)
    private lastFrameTime = 0;
    private renderObserver: { remove(): void } | null = null;
    private logTimer: ReturnType<typeof setInterval> | null = null;

    private readonly windowSize: number;     // nb de frames gardées
    private readonly logIntervalMs: number;

    constructor(
        private scene: Scene,
        private scheduler: MidiLookaheadScheduler,
        private adapter: IMusicGeneratorAdapter & { backend?: string },
        opts: { windowSize?: number; logIntervalMs?: number } = {},
    ) {
        this.windowSize = opts.windowSize ?? 180;       // ~3 s à 60 fps
        this.logIntervalMs = opts.logIntervalMs ?? 2000; // log toutes les 2 s
    }

    start(): void {
        this.lastFrameTime = performance.now();
        this.frameTimes = [];

        // Hook de la boucle de rendu — mesure le delta entre frames
        const obs = this.scene.onBeforeRenderObservable.add(() => {
            const now = performance.now();
            const delta = now - this.lastFrameTime;
            this.lastFrameTime = now;
            this.frameTimes.push(delta);
            if (this.frameTimes.length > this.windowSize) this.frameTimes.shift();
        });
        this.renderObserver = { remove: () => this.scene.onBeforeRenderObservable.remove(obs) };

        // Logger consolidé périodique
        this.logTimer = setInterval(() => this.log(), this.logIntervalMs);

        console.log("[PerfMonitor] démarré — surveille les frame times du main thread.");
    }

    stop(): void {
        this.renderObserver?.remove();
        this.renderObserver = null;
        if (this.logTimer) { clearInterval(this.logTimer); this.logTimer = null; }
    }

    snapshot(): PerfSnapshot {
        const ft = this.frameTimes;
        const n = ft.length;

        let avg = 0, max = 0;
        let janky = 0;
        for (const v of ft) {
            avg += v;
            if (v > max) max = v;
            if (v > 33) janky++;          // < 30 fps
        }
        avg = n > 0 ? avg / n : 0;
        const sorted = [...ft].sort((a, b) => a - b);
        const p95 = n > 0 ? sorted[Math.floor(n * 0.95)] : 0;

        const ss = this.scheduler.stats;
        const as = this.adapter.stats;

        return {
            fps: avg > 0 ? 1000 / avg : 0,
            avgFrameMs: avg,
            maxFrameMs: max,
            p95FrameMs: p95,
            jankyFrames: janky,
            frameCount: n,

            adapterAvgMs: as.avgInferenceMs,
            adapterP95Ms: as.p95InferenceMs,
            adapterP99Ms: as.p99InferenceMs,
            adapterCalls: as.callCount,
            adapterBackend: this.adapter.backend ?? "?",

            notesGenerated: ss.notesGenerated,
            notesPlayed: ss.notesPlayed,
            bufferDepthSec: ss.bufferDepthSec,
            lateEvents: ss.lateEvents,
            lowBufferTicks: ss.lowBufferTicks,
        };
    }

    private log(): void {
        const s = this.snapshot();
        // Indicateur de santé visuel : le frame max est-il OK ?
        const frameHealth = s.maxFrameMs <= 25 ? "✓ FLUIDE"
            : s.maxFrameMs <= 50 ? "~ accrocs légers"
            : "✗ GÈLE";

        console.log(
            "%c[PerfMonitor]", "color:#0a8;font-weight:bold",
            `\n  RENDU    : ${s.fps.toFixed(0)} fps  |  frame avg ${s.avgFrameMs.toFixed(1)}ms` +
            `  p95 ${s.p95FrameMs.toFixed(1)}ms  MAX ${s.maxFrameMs.toFixed(0)}ms  ${frameHealth}` +
            `\n             janky(>33ms) ${s.jankyFrames}/${s.frameCount} frames` +
            `\n  INFÉRENCE: backend=${s.adapterBackend}  avg ${s.adapterAvgMs.toFixed(1)}ms` +
            `  p95 ${s.adapterP95Ms.toFixed(1)}ms  p99 ${s.adapterP99Ms.toFixed(1)}ms  (${s.adapterCalls} appels)` +
            `\n  FLUX     : générées ${s.notesGenerated}  jouées ${s.notesPlayed}` +
            `  buffer ${s.bufferDepthSec.toFixed(2)}s  retards ${s.lateEvents}  lowBuf ${s.lowBufferTicks}`,
        );
    }
}
