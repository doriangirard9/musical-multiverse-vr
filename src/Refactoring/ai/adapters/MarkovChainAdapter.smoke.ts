// ─── Test de fumée — MarkovChainAdapter ──────────────────────────────────────
//
//   Pas un vrai test unitaire (pas de framework pour l'instant) — juste un
//   script exécutable qui :
//     1. Instancie l'adapter
//     2. Appelle init() et vérifie la durée
//     3. Génère ~100 notes via requestNext() en boucle
//     4. Imprime les stats finales
//     5. Vérifie que toutes les notes sont dans la plage MIDI (0..127)
//     6. Vérifie qu'il n'y a pas eu de failures
//
//   Lancement (depuis la racine du projet) :
//     npx tsx src/Refactoring/ai/adapters/MarkovChainAdapter.smoke.ts
//
//   Ou en page HTML quand l'intégration WebAudio sera là.  Pour S1, en
//   ligne de commande c'est largement suffisant.

import { MarkovChainAdapter } from "./MarkovChainAdapter";
import { MidiEvent } from "../types";

async function main() {
    console.log("=== Smoke test: MarkovChainAdapter ===\n");

    const adapter = new MarkovChainAdapter({ order: 4, seed: 42 });

    // 1. Init
    console.log(`Adapter id           : ${adapter.id}`);
    console.log(`Adapter displayName  : ${adapter.displayName}`);
    console.log(`Adapter tier         : ${adapter.tier}`);
    console.log(`Hyperparameters      : ${adapter.capabilities.hyperparameters
        .map(h => h.name).join(", ")}\n`);

    await adapter.init({
        progressCallback: (p) => process.stdout.write(`init progress: ${(p * 100).toFixed(0)}%\r`),
    });
    process.stdout.write("\n");
    console.log(`Init time            : ${adapter.stats.initTimeMs.toFixed(2)} ms\n`);

    // 2. Boucle de génération : 50 fenêtres de 250 ms (~ 12.5 secondes simulées)
    const WINDOW_MS = 250;
    const N_WINDOWS = 50;

    const allEvents: MidiEvent[] = [];
    let context: MidiEvent[] = [];

    for (let i = 0; i < N_WINDOWS; i++) {
        const events = await adapter.requestNext(context, WINDOW_MS);
        allEvents.push(...events);
        // Glisser le contexte (garder les 16 derniers événements)
        context = [...context, ...events].slice(-16);
    }

    // 3. Validation des sorties
    const notes = allEvents.filter(e => e.type === "note-on");
    const validNotes = notes.filter(
        e => e.note !== undefined && e.note >= 0 && e.note <= 127
        && e.velocity !== undefined && e.velocity >= 0 && e.velocity <= 127,
    );

    console.log("=== Résultats ===");
    console.log(`Fenêtres générées    : ${N_WINDOWS}`);
    console.log(`Événements émis      : ${allEvents.length}`);
    console.log(`Notes-on             : ${notes.length}`);
    console.log(`Notes valides (MIDI) : ${validNotes.length} / ${notes.length}`);
    console.log(`Densité observée     : ${(notes.length / (N_WINDOWS * WINDOW_MS / 1000)).toFixed(2)} notes/sec`);
    console.log(`  (consigne density  : ${adapter.getHyperparameter("density")} notes/sec)`);
    console.log();

    console.log("=== Stats finales ===");
    console.log(`callCount            : ${adapter.stats.callCount}`);
    console.log(`avgInferenceMs       : ${adapter.stats.avgInferenceMs.toFixed(4)} ms`);
    console.log(`p50InferenceMs       : ${adapter.stats.p50InferenceMs.toFixed(4)} ms`);
    console.log(`p95InferenceMs       : ${adapter.stats.p95InferenceMs.toFixed(4)} ms`);
    console.log(`p99InferenceMs       : ${adapter.stats.p99InferenceMs.toFixed(4)} ms`);
    console.log(`failureCount         : ${adapter.stats.failureCount}`);
    console.log(`memHeapBytes         : ${adapter.stats.memHeapBytes} (0 = indispo hors Chrome)\n`);

    // 4. Test de variation des hyperparamètres
    console.log("=== Test de plage des hyperparamètres ===");
    for (const h of adapter.capabilities.hyperparameters) {
        adapter.setHyperparameter(h.name, h.min);
        adapter.setHyperparameter(h.name, h.max);
        adapter.setHyperparameter(h.name, h.default);
        console.log(`  ${h.name.padEnd(15)} [${h.min}, ${h.max}] OK`);
    }
    console.log();

    // 5. Test d'une consigne hors plage (doit lever)
    let threw = false;
    try {
        adapter.setHyperparameter("temperature", 99);
    } catch (e) {
        threw = true;
    }
    console.log(`Setter rejette les valeurs hors plage : ${threw ? "OK" : "ÉCHEC"}`);

    // 6. Test d'un hyperparamètre inconnu (doit lever)
    threw = false;
    try {
        adapter.setHyperparameter("nonexistent", 0.5);
    } catch (e) {
        threw = true;
    }
    console.log(`Setter rejette les noms inconnus      : ${threw ? "OK" : "ÉCHEC"}`);

    // 7. Cleanup
    await adapter.dispose();
    console.log("\n=== Test de fumée terminé ===");

    // Bilan
    const ok =
        validNotes.length === notes.length
        && adapter.stats.failureCount === 0
        && adapter.stats.callCount === N_WINDOWS;
    process.exit(ok ? 0 : 1);
}

main().catch((e) => {
    console.error("Smoke test failed:", e);
    process.exit(1);
});
