// ─── scheduler-test-page.ts ──────────────────────────────────────────────────
//
//   Page de validation du MidiLookaheadScheduler branché sur un VRAI Pro54.
//
//   Objectif scientifique : valider que le buffering look-ahead masque les
//   pics GC de TF.js → AUCUN glitch audible sur plusieurs minutes.
//
//   Critère de succès :
//     • stats.lateEvents == 0  (aucun événement programmé dans le passé)
//     • stats.lowBufferTicks faible et stable (le buffer ne se vide jamais)
//     • À l'oreille : flux musical continu, sans trou ni hoquet
//
//   Contrôles exposés (les "modulations post-gen" jouables) :
//     • Horizon (slider)        — l'horizon de génération, modifiable à chaud
//     • Tempo (slider)          — tempoScale, immédiat
//     • Vélocité (slider)       — velocityScale, immédiat
//     • Température (slider)     — hyperparamètre du modèle (bufferisé)
//     • Choix du modèle         — melody_rnn / basic_rnn / Markov
//
//   Usage :
//     make all  (ou npm run dev)
//     → https://localhost:5179/src/ai/scheduler/scheduler-test-page.html

import { initializeWamHost } from "@webaudiomodules/sdk";
import { IMusicGeneratorAdapter } from "../IMusicGeneratorAdapter";
import { MidiEvent } from "../types";
import { MidiLookaheadScheduler } from "./MidiLookaheadScheduler";
import { MarkovChainAdapter } from "../adapters/MarkovChainAdapter";
import { MagentaMusicRNNAdapter, MagentaRNNVariant } from "../adapters/MagentaMusicRNNAdapter";

const PRO54_URL = "https://wam-4tt.pages.dev/Pro54/index.js";

// ─── État global ─────────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;
let pro54: any = null;             // instance WAM Pro54
let scheduler: MidiLookaheadScheduler | null = null;
let adapter: IMusicGeneratorAdapter | null = null;
let statsTimer: ReturnType<typeof setInterval> | null = null;

// ─── Construction d'un adapter selon le choix ────────────────────────────────

function makeAdapter(choice: string): IMusicGeneratorAdapter {
    if (choice === "markov") {
        return new MarkovChainAdapter({ order: 4, seed: 42 });
    }
    const variant = choice as MagentaRNNVariant;
    return new MagentaMusicRNNAdapter({ variant, primerMaxNotes: 8 });
}

// ─── Chargement du Pro54 ─────────────────────────────────────────────────────

async function loadPro54(ctx: AudioContext, log: (m: string) => void): Promise<any> {
    log("Initialisation du host WAM…");
    const [hostGroupId] = await initializeWamHost(ctx);

    log(`Chargement du Pro54 depuis ${PRO54_URL} …`);
    const { default: WAM } = await import(/* @vite-ignore */ PRO54_URL);
    const instance = await WAM.createInstance(hostGroupId, ctx);

    // Pro54 → destination (mono test, pas d'effet pour isoler le scheduler)
    instance.audioNode.connect(ctx.destination);
    log("Pro54 connecté à la sortie audio.");
    return instance;
}

// ─── Le scheduleCallback : convertit MidiEvent → message wam-midi horodaté ────
//
//   C'est le point d'injection découplé : le scheduler ne connaît pas Pro54,
//   il appelle juste cette fonction avec (event, timeSec).
//
function makeScheduleCallback(pro54Instance: any): (ev: MidiEvent, timeSec: number) => void {
    return (ev: MidiEvent, timeSec: number) => {
        const node = pro54Instance.audioNode;
        const channel = ev.channel ?? 0;

        if (ev.type === "note-on" && ev.note !== undefined) {
            node.scheduleEvents({
                type: "wam-midi",
                time: timeSec,
                data: { bytes: [0x90 | channel, ev.note, ev.velocity ?? 80] },
            });
        } else if (ev.type === "note-off" && ev.note !== undefined) {
            node.scheduleEvents({
                type: "wam-midi",
                time: timeSec,
                data: { bytes: [0x80 | channel, ev.note, 0] },
            });
        }
    };
}

// ─── Setup de la page ────────────────────────────────────────────────────────

function setupPage(): void {
    document.body.innerHTML = `
        <style>
            body { font-family: -apple-system, system-ui, sans-serif; margin: 24px; max-width: 900px; }
            h1 { color: #333; }
            .panel { background: white; padding: 16px; border: 1px solid #ddd; border-radius: 8px; margin: 12px 0; }
            label { display: inline-block; width: 130px; font-size: 14px; }
            input[type=range] { width: 280px; vertical-align: middle; }
            .val { display: inline-block; width: 60px; text-align: right; font-family: ui-monospace, monospace; }
            button { font-size: 16px; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; color: white; }
            #start { background: #2a8; } #stop { background: #c44; }
            button:disabled { background: #999; }
            select { font-size: 15px; padding: 6px; }
            #stats { font-family: ui-monospace, monospace; font-size: 13px; white-space: pre; background: #1e1e1e; color: #ddd; padding: 14px; border-radius: 6px; }
            #log { font-family: ui-monospace, monospace; font-size: 12px; white-space: pre; max-height: 160px; overflow: auto; background: #f4f4f4; padding: 10px; border-radius: 6px; }
            .late-zero { color: #2a8; } .late-bad { color: #f55; }
        </style>
        <h1>Validation — MidiLookaheadScheduler → Pro54</h1>
        <p>Valide que le buffering look-ahead masque les pics GC : <b>lateEvents doit rester à 0</b> et le son doit être continu.</p>

        <div class="panel">
            <label>Modèle :</label>
            <select id="model">
                <option value="melody_rnn">Magenta melody_rnn</option>
                <option value="basic_rnn">Magenta basic_rnn</option>
                <option value="markov">Markov (baseline)</option>
            </select>
            <button id="start" style="margin-left:16px;">▶ Démarrer</button>
            <button id="stop" disabled>■ Arrêter</button>
        </div>

        <div class="panel">
            <div><label>Horizon (gén.) :</label>
                <input type="range" id="horizon" min="0.1" max="2.0" step="0.05" value="0.5">
                <span class="val" id="horizonVal">0.50 s</span>
                <small>← bufferisé</small></div>
            <div><label>Tempo :</label>
                <input type="range" id="tempo" min="0.25" max="3.0" step="0.05" value="1.0">
                <span class="val" id="tempoVal">1.00×</span>
                <small>← immédiat</small></div>
            <div><label>Vélocité :</label>
                <input type="range" id="velocity" min="0.0" max="2.0" step="0.05" value="1.0">
                <span class="val" id="velocityVal">1.00×</span>
                <small>← immédiat</small></div>
            <div><label>Température :</label>
                <input type="range" id="temperature" min="0.1" max="2.0" step="0.05" value="1.0">
                <span class="val" id="temperatureVal">1.00</span>
                <small>← hyperparamètre (bufferisé)</small></div>
        </div>

        <div class="panel">
            <h3>Stats temps réel</h3>
            <div id="stats">— non démarré —</div>
        </div>

        <div class="panel">
            <h3>Log</h3>
            <div id="log"></div>
        </div>
    `;

    const $ = (id: string) => document.getElementById(id)!;
    const startBtn = $("start") as HTMLButtonElement;
    const stopBtn = $("stop") as HTMLButtonElement;
    const modelSel = $("model") as HTMLSelectElement;
    const logDiv = $("log");
    const statsDiv = $("stats");

    const log = (m: string) => {
        logDiv.textContent += `[${new Date().toLocaleTimeString()}] ${m}\n`;
        logDiv.scrollTop = logDiv.scrollHeight;
        console.log(m);
    };

    // ── Sliders ────────────────────────────────────────────────────────────
    const bindSlider = (id: string, fmt: (v: number) => string, onChange: (v: number) => void) => {
        const slider = $(id) as HTMLInputElement;
        const valSpan = $(id + "Val");
        const update = () => {
            const v = parseFloat(slider.value);
            valSpan.textContent = fmt(v);
            onChange(v);
        };
        slider.addEventListener("input", update);
        update();
    };

    bindSlider("horizon", v => v.toFixed(2) + " s", v => scheduler?.setHorizonSec(v));
    bindSlider("tempo", v => v.toFixed(2) + "×", v => scheduler?.setTempoScale(v));
    bindSlider("velocity", v => v.toFixed(2) + "×", v => scheduler?.setVelocityScale(v));
    bindSlider("temperature", v => v.toFixed(2), v => {
        try { adapter?.setHyperparameter("temperature", v); } catch (_) { /* not ready */ }
    });

    // ── Démarrage ──────────────────────────────────────────────────────────
    startBtn.addEventListener("click", async () => {
        startBtn.disabled = true;
        modelSel.disabled = true;
        try {
            if (!audioCtx) {
                audioCtx = new AudioContext();
            }
            await audioCtx.resume();

            if (!pro54) {
                pro54 = await loadPro54(audioCtx, log);
            }

            // (Re)créer l'adapter selon le choix
            const choice = modelSel.value;
            log(`Création de l'adapter : ${choice}`);
            adapter = makeAdapter(choice);
            await adapter.init({
                progressCallback: p => log(`  init ${(p * 100).toFixed(0)}%`),
            });
            log(`Adapter prêt (init ${adapter.stats.initTimeMs.toFixed(0)} ms).`);

            // Appliquer la température courante du slider
            const tempV = parseFloat(($("temperature") as HTMLInputElement).value);
            try { adapter.setHyperparameter("temperature", tempV); } catch (_) {}

            // Créer le scheduler
            scheduler = new MidiLookaheadScheduler(
                adapter,
                () => audioCtx!.currentTime,
                makeScheduleCallback(pro54),
                { horizonSec: parseFloat(($("horizon") as HTMLInputElement).value) },
            );
            scheduler.setTempoScale(parseFloat(($("tempo") as HTMLInputElement).value));
            scheduler.setVelocityScale(parseFloat(($("velocity") as HTMLInputElement).value));

            scheduler.start();
            log("Scheduler démarré. Le son devrait commencer.");

            stopBtn.disabled = false;

            // Boucle d'affichage des stats
            statsTimer = setInterval(() => {
                if (!scheduler) return;
                const s = scheduler.stats;
                const lateClass = s.lateEvents === 0 ? "late-zero" : "late-bad";
                statsDiv.innerHTML =
                    `generationCalls : ${s.generationCalls}\n` +
                    `scheduledEvents : ${s.scheduledEvents}\n` +
                    `<span class="${lateClass}">lateEvents      : ${s.lateEvents}  ${s.lateEvents === 0 ? "✓ (aucun glitch)" : "✗ GLITCH"}</span>\n` +
                    `lowBufferTicks  : ${s.lowBufferTicks}\n` +
                    `bufferDepthSec  : ${s.bufferDepthSec.toFixed(3)} s\n` +
                    `adapter p95     : ${adapter!.stats.p95InferenceMs.toFixed(1)} ms\n` +
                    `adapter p99     : ${adapter!.stats.p99InferenceMs.toFixed(1)} ms`;
            }, 250);

        } catch (e: any) {
            log(`ERREUR : ${e?.stack || e?.message || String(e)}`);
            startBtn.disabled = false;
            modelSel.disabled = false;
        }
    });

    // ── Arrêt ──────────────────────────────────────────────────────────────
    stopBtn.addEventListener("click", async () => {
        scheduler?.stop();
        if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
        if (adapter) { await adapter.dispose(); }
        scheduler = null;
        adapter = null;
        log("Arrêté.");
        stopBtn.disabled = true;
        startBtn.disabled = false;
        modelSel.disabled = false;
    });
}

try {
    setupPage();
} catch (e: any) {
    document.body.textContent = "Erreur setupPage : " + (e?.stack || e?.message || String(e));
    console.error(e);
}
