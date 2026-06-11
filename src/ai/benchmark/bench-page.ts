// ─── bench-page.ts ───────────────────────────────────────────────────────────
//
//   Module chargé par bench-page.html.  Expose un bouton "Run Benchmark"
//   qui exécute un protocole de mesure standard sur les adapters
//   sélectionnés et affiche les résultats.
//
//   Usage :
//     1. Lancer `make dev` (ou `npm run dev`)
//     2. Ouvrir https://localhost:5179/src/ai/benchmark/bench-page.html
//     3. Cliquer "Run benchmark"
//     4. Copier-coller les résultats dans PFE_JOURNAL.md
//
//   Le protocole est défini dans Section 5.3 du plan PFE — warmup, mesure,
//   répétitions, balayage de température.

import { IMusicGeneratorAdapter } from "../IMusicGeneratorAdapter";
import { MidiEvent } from "../types";
import { MarkovChainAdapter } from "../adapters/MarkovChainAdapter";
import { MagentaMusicRNNAdapter } from "../adapters/MagentaMusicRNNAdapter";

// ─── Configuration du protocole ──────────────────────────────────────────────

const PROTOCOL = {
    warmupCalls: 5,        // appels ignorés dans les stats (warmup JIT/WebGL)
    measurementCalls: 60,  // appels mesurés
    windowMs: 250,         // durée par appel à requestNext()
    temperatures: [0.5, 0.8, 1.0, 1.2, 1.5],   // balayage température
    repeats: 1,            // répétitions complètes (S2 : 1 pour aller vite)
};

// ─── Adapter factories ───────────────────────────────────────────────────────

interface AdapterConfig {
    label: string;
    factory: () => IMusicGeneratorAdapter;
}

const ADAPTERS: AdapterConfig[] = [
    {
        label: "Markov (baseline)",
        factory: () => new MarkovChainAdapter({ order: 4, seed: 42 }),
    },
    {
        label: "Magenta basic_rnn (primer 8)",
        factory: () => new MagentaMusicRNNAdapter({ variant: "basic_rnn", primerMaxNotes: 8 }),
    },
    {
        label: "Magenta basic_rnn (primer 4)",
        factory: () => new MagentaMusicRNNAdapter({ variant: "basic_rnn", primerMaxNotes: 4 }),
    },
    {
        label: "Magenta basic_rnn (primer 16)",
        factory: () => new MagentaMusicRNNAdapter({ variant: "basic_rnn", primerMaxNotes: 16 }),
    },
    {
        label: "Magenta melody_rnn (primer 8)",
        factory: () => new MagentaMusicRNNAdapter({ variant: "melody_rnn", primerMaxNotes: 8 }),
    },
    {
        label: "Magenta chord_pitches_improv (primer 8)",
        factory: () => new MagentaMusicRNNAdapter({ variant: "chord_pitches_improv", primerMaxNotes: 8 }),
    },
];

// ─── Résultats ───────────────────────────────────────────────────────────────

interface AdapterResult {
    label: string;
    id: string;
    initTimeMs: number;
    avgInferenceMs: number;
    p50InferenceMs: number;
    p95InferenceMs: number;
    p99InferenceMs: number;
    memHeapMB: number;
    failureCount: number;
    notesEmitted: number;
    avgNotesPerCall: number;
    temperatureSweep: { temp: number; avgMs: number; p95Ms: number }[];
    error?: string;
}

// ─── Protocole d'exécution ───────────────────────────────────────────────────

async function benchmarkAdapter(
    adapter: IMusicGeneratorAdapter,
    label: string,
    log: (msg: string) => void,
): Promise<AdapterResult> {
    const result: AdapterResult = {
        label,
        id: adapter.id,
        initTimeMs: 0,
        avgInferenceMs: 0,
        p50InferenceMs: 0,
        p95InferenceMs: 0,
        p99InferenceMs: 0,
        memHeapMB: 0,
        failureCount: 0,
        notesEmitted: 0,
        avgNotesPerCall: 0,
        temperatureSweep: [],
    };

    try {
        // 1. Init
        log(`[${label}] init...`);
        await adapter.init({
            progressCallback: (p) => log(`[${label}] init progress: ${(p * 100).toFixed(0)}%`),
        });
        result.initTimeMs = adapter.stats.initTimeMs;
        log(`[${label}] init done in ${result.initTimeMs.toFixed(0)} ms`);

        // 2. Warmup (à température 1.0)
        adapter.setHyperparameter("temperature", 1.0);
        let context: MidiEvent[] = [];
        log(`[${label}] warmup (${PROTOCOL.warmupCalls} calls)...`);
        for (let i = 0; i < PROTOCOL.warmupCalls; i++) {
            const events = await adapter.requestNext(context, PROTOCOL.windowMs);
            context = [...context, ...events].slice(-16);
        }
        // Reset stats après warmup
        adapter.stats.callCount = 0;
        (adapter as any).latencies = [];

        // 3. Balayage de température
        for (const temp of PROTOCOL.temperatures) {
            adapter.setHyperparameter("temperature", temp);
            const tempLatencies: number[] = [];
            for (let i = 0; i < 10; i++) {  // 10 appels par température
                const t0 = performance.now();
                await adapter.requestNext(context, PROTOCOL.windowMs);
                tempLatencies.push(performance.now() - t0);
            }
            const sorted = [...tempLatencies].sort((a, b) => a - b);
            const avgMs = tempLatencies.reduce((a, b) => a + b, 0) / tempLatencies.length;
            const p95Ms = sorted[Math.floor(sorted.length * 0.95)];
            result.temperatureSweep.push({ temp, avgMs, p95Ms });
            log(`[${label}]   temp=${temp.toFixed(1)}  avg=${avgMs.toFixed(1)} ms  p95=${p95Ms.toFixed(1)} ms`);
        }

        // 4. Mesure principale (à température 1.0)
        adapter.setHyperparameter("temperature", 1.0);
        (adapter as any).latencies = [];
        let totalNotes = 0;
        log(`[${label}] main measurement (${PROTOCOL.measurementCalls} calls)...`);
        for (let i = 0; i < PROTOCOL.measurementCalls; i++) {
            const events = await adapter.requestNext(context, PROTOCOL.windowMs);
            totalNotes += events.filter(e => e.type === "note-on").length;
            context = [...context, ...events].slice(-16);
            if ((i + 1) % 20 === 0) {
                log(`[${label}]   ${i + 1}/${PROTOCOL.measurementCalls}, avg=${adapter.stats.avgInferenceMs.toFixed(1)} ms`);
            }
        }

        result.avgInferenceMs = adapter.stats.avgInferenceMs;
        result.p50InferenceMs = adapter.stats.p50InferenceMs;
        result.p95InferenceMs = adapter.stats.p95InferenceMs;
        result.p99InferenceMs = adapter.stats.p99InferenceMs;
        result.memHeapMB = adapter.stats.memHeapBytes / (1024 * 1024);
        result.failureCount = adapter.stats.failureCount;
        result.notesEmitted = totalNotes;
        result.avgNotesPerCall = totalNotes / PROTOCOL.measurementCalls;

        log(`[${label}] done`);
    } catch (e: any) {
        result.error = e?.message ?? String(e);
        log(`[${label}] ERROR: ${result.error}`);
    } finally {
        try {
            await adapter.dispose();
        } catch (_) { /* swallow */ }
    }

    return result;
}

// ─── Affichage des résultats ─────────────────────────────────────────────────

function renderResultsTable(results: AdapterResult[]): string {
    const headers = [
        "Adapter", "Init (ms)", "Avg (ms)", "p50 (ms)", "p95 (ms)", "p99 (ms)",
        "Mem (MB)", "Notes/call", "Failures",
    ];
    const rows = results.map(r => [
        r.label,
        r.error ? "—" : r.initTimeMs.toFixed(0),
        r.error ? "—" : r.avgInferenceMs.toFixed(2),
        r.error ? "—" : r.p50InferenceMs.toFixed(2),
        r.error ? "—" : r.p95InferenceMs.toFixed(2),
        r.error ? "—" : r.p99InferenceMs.toFixed(2),
        r.error ? "—" : r.memHeapMB.toFixed(1),
        r.error ? "—" : r.avgNotesPerCall.toFixed(1),
        r.error ? "ERR" : r.failureCount.toString(),
    ]);
    return markdownTable([headers, ...rows]);
}

function renderTempSweepTable(results: AdapterResult[]): string {
    // Une ligne par (adapter, temp)
    const rows: string[][] = [["Adapter", "Temp", "Avg (ms)", "p95 (ms)"]];
    for (const r of results) {
        if (r.error) continue;
        for (const t of r.temperatureSweep) {
            rows.push([r.label, t.temp.toFixed(1), t.avgMs.toFixed(2), t.p95Ms.toFixed(2)]);
        }
    }
    return markdownTable(rows);
}

function markdownTable(rows: string[][]): string {
    if (rows.length === 0) return "";
    const widths = rows[0].map((_, col) =>
        Math.max(...rows.map(r => (r[col] ?? "").length)),
    );
    const fmtRow = (r: string[]) =>
        "| " + r.map((cell, i) => (cell ?? "").padEnd(widths[i])).join(" | ") + " |";
    const sep = "|" + widths.map(w => "-".repeat(w + 2)).join("|") + "|";
    return [fmtRow(rows[0]), sep, ...rows.slice(1).map(fmtRow)].join("\n");
}

function renderEnvironment(): string {
    const ua = navigator.userAgent;
    const cores = navigator.hardwareConcurrency;
    const mem = (navigator as any).deviceMemory ?? "?";
    const memJS = (performance as any).memory?.usedJSHeapSize / (1024 * 1024);
    return [
        `**Date** : ${new Date().toISOString()}`,
        `**Navigateur** : ${ua}`,
        `**Cores logiques** : ${cores}`,
        `**RAM device** : ${mem} GB`,
        `**Heap JS au départ** : ${memJS ? memJS.toFixed(1) + " MB" : "n/a"}`,
    ].join("\n");
}

// ─── Setup de la page ────────────────────────────────────────────────────────

function setupPage(): void {
    document.body.innerHTML = `
        <style>
            body { font-family: -apple-system, system-ui, sans-serif; margin: 24px; max-width: 1200px; background: #fafafa; }
            h1 { color: #333; }
            #env, #results, #log { background: white; padding: 16px; border: 1px solid #ddd; border-radius: 6px; margin: 12px 0; }
            #log { font-family: ui-monospace, monospace; font-size: 12px; white-space: pre; max-height: 400px; overflow: auto; background: #1e1e1e; color: #ddd; }
            pre { white-space: pre-wrap; }
            button { font-size: 16px; padding: 10px 20px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; }
            button:disabled { background: #999; }
            .copy-btn { font-size: 12px; padding: 4px 10px; background: #555; }
            table { border-collapse: collapse; }
            th, td { padding: 4px 8px; text-align: left; border: 1px solid #ddd; }
        </style>
        <h1>Benchmark IMusicGeneratorAdapter</h1>
        <p>Protocole : ${PROTOCOL.warmupCalls} warmup + ${PROTOCOL.measurementCalls} mesures × ${PROTOCOL.windowMs} ms par adapter, balayage température sur ${PROTOCOL.temperatures.length} valeurs.</p>
        <button id="run">Run benchmark</button>
        <button id="copy" class="copy-btn" style="display:none;margin-left:8px;">Copier le markdown</button>
        <div id="env"><h2>Environnement</h2><pre>${renderEnvironment()}</pre></div>
        <div id="results"><em>Pas encore exécuté.</em></div>
        <div id="log"></div>
    `;

    const runBtn = document.getElementById("run") as HTMLButtonElement;
    const copyBtn = document.getElementById("copy") as HTMLButtonElement;
    const resultsDiv = document.getElementById("results")!;
    const logDiv = document.getElementById("log")!;

    let lastMarkdown = "";

    const log = (msg: string) => {
        const line = `[${new Date().toLocaleTimeString()}] ${msg}\n`;
        logDiv.textContent += line;
        logDiv.scrollTop = logDiv.scrollHeight;
        console.log(msg);
    };

    runBtn.addEventListener("click", async () => {
        runBtn.disabled = true;
        runBtn.textContent = "Running...";
        logDiv.textContent = "";
        resultsDiv.innerHTML = "<em>En cours…</em>";

        const allResults: AdapterResult[] = [];
        for (const cfg of ADAPTERS) {
            log(`\n=== ${cfg.label} ===`);
            const adapter = cfg.factory();
            const result = await benchmarkAdapter(adapter, cfg.label, log);
            allResults.push(result);
        }

        const mdMain = renderResultsTable(allResults);
        const mdTemp = renderTempSweepTable(allResults);
        const mdEnv = renderEnvironment();

        lastMarkdown = [
            "## Résultats benchmark",
            "",
            "### Environnement",
            mdEnv,
            "",
            "### Tableau principal",
            mdMain,
            "",
            "### Balayage de température",
            mdTemp,
        ].join("\n");

        resultsDiv.innerHTML = `<h2>Résultats</h2><pre>${lastMarkdown.replace(/</g, "&lt;")}</pre>`;
        copyBtn.style.display = "inline-block";

        runBtn.disabled = false;
        runBtn.textContent = "Run benchmark";
        log("\n=== Benchmark terminé ===");
    });

    copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(lastMarkdown).then(() => {
            copyBtn.textContent = "Copié !";
            setTimeout(() => (copyBtn.textContent = "Copier le markdown"), 1500);
        });
    });
}

try {
    setupPage();
} catch (e: any) {
    const box = document.getElementById("boot-error") ?? document.body;
    if (box instanceof HTMLElement) {
        (box as HTMLElement).style.display = "block";
        box.textContent = "❌ Erreur dans setupPage() :\n\n" +
            (e?.stack || e?.message || String(e));
    }
    console.error("setupPage failed:", e);
}
