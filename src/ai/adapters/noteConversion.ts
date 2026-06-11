import { MidiEvent } from "../types";

// ─── Conversion notes quantifiées → MidiEvent[] (mono ET polyphonie) ─────────
//
//   Partagé par les adapters Magenta (RNN et VAE). Émission ÉVÉNEMENTIELLE
//   triée : chaque note est éclatée en (on@start) et (off@end), tous les
//   événements sont triés par step (off avant on à step égal pour éviter un
//   retrigger sur la même hauteur), puis deltaMs = écart depuis l'événement
//   précédent. Le scheduler additionne ces deltas → temps absolus corrects,
//   polyphonie incluse (plusieurs note-on au même step = deltas nuls).
//
//   GRILLE RYTHMIQUE — règles de conservation des silences :
//     • Silence de TÊTE de chunk : le premier delta part du step 0 du chunk
//       (prevStep = 0), pas du premier événement — sinon les chunks se
//       collent et le rythme se compresse.
//     • Silence de QUEUE de chunk : il n'a pas d'événement porteur ; c'est
//       l'ADAPTER qui le reporte sur le premier delta du chunk suivant
//       (cf. carry dans MagentaMusicRNNAdapter / MusicVAEAdapter, via
//       notesEndStep).
//
//   MUSICALITÉ — vélocités façonnées au lieu du 90 constant :
//     • Mélodie : accents métriques (temps fort de mesure > temps > croche)
//       + légère humanisation aléatoire.
//     • Batterie : vélocité par type de fût (kick fort, hi-hat doux) +
//       humanisation — donne le groove.

export interface QuantNote {
    pitch?: number | null;
    quantizedStartStep?: number | null;
    quantizedEndStep?: number | null;
    velocity?: number | null;
}

export interface ConvertOpts {
    msPerStep: number;
    /** true : batterie (pitch = type de fût, pas de repliement). */
    isDrums: boolean;
    /** Repliement mélodique : centre et étendue de tessiture (ignorés si isDrums). */
    octaveCenter: number;
    pitchRange: number;
    /** Canal MIDI de sortie. */
    channel: number;
}

/**
 * Replie une hauteur MIDI dans [center ± range/2] par sauts d'octave (±12).
 * Préserve la classe de hauteur (l'harmonie) tout en gardant la note DANS la
 * plage — au lieu de la supprimer et trouer le rythme.
 */
export function foldIntoRange(pitch: number, center: number, range: number): number {
    const min = center - range / 2;
    const max = center + range / 2;
    let p = pitch;
    while (p < min) p += 12;
    while (p > max) p -= 12;
    return Math.max(0, Math.min(127, Math.round(p)));
}

/**
 * Dernier step occupé par les notes (fin de la dernière note, mêmes règles de
 * défaut que la conversion). Sert aux adapters à calculer le silence de queue
 * de chunk à reporter sur le chunk suivant. 0 si aucune note.
 */
export function notesEndStep(notes: QuantNote[]): number {
    let last = 0;
    for (const n of notes) {
        const start = n.quantizedStartStep ?? 0;
        const end = Math.max(start + 1, n.quantizedEndStep ?? start + 1);
        if (end > last) last = end;
    }
    return last;
}

// Vélocités de référence par fût GM (groove de base, modulées ±jitter)
const DRUM_VELOCITY: Record<number, number> = {
    35: 108, 36: 108,   // kick
    38: 98,  40: 98,    // snare
    42: 62,  44: 58,    // hi-hat fermé / pédale
    46: 76,             // hi-hat ouvert
    49: 100, 57: 100,   // crash
    51: 72,  59: 72,    // ride
    45: 88,  47: 88, 48: 88, 50: 88,   // toms
};

/** Accent métrique mélodique : 1er temps de mesure > temps > croches. */
function metricAccent(step: number): number {
    if (step % 16 === 0) return 1.0;     // début de mesure (4/4, 16 steps)
    if (step % 4 === 0)  return 0.92;    // temps
    if (step % 2 === 0)  return 0.84;    // croche
    return 0.78;                          // double-croche
}

const jitter = (amp: number) => (Math.random() * 2 - 1) * amp;
const clampVel = (v: number) => Math.max(1, Math.min(127, Math.round(v)));

export function notesToMidiEvents(notes: QuantNote[], opts: ConvertOpts): MidiEvent[] {
    const { msPerStep, isDrums, octaveCenter, pitchRange, channel } = opts;

    type TEv = { step: number; on: boolean; pitch: number; velocity: number };
    const timed: TEv[] = [];

    for (const n of notes) {
        const startStep = n.quantizedStartStep ?? 0;
        const endStep = Math.max(startStep + 1, n.quantizedEndStep ?? startStep + 1);
        const rawPitch = n.pitch ?? 60;
        const pitch = isDrums
            ? Math.max(0, Math.min(127, rawPitch))
            : foldIntoRange(rawPitch, octaveCenter, pitchRange);

        // Vélocité musicale : par fût (batterie) ou par accent métrique
        // (mélodie), humanisée. Une vélocité explicite du modèle est
        // respectée comme base.
        const velocity = isDrums
            ? clampVel((n.velocity ?? DRUM_VELOCITY[pitch] ?? 84) + jitter(6))
            : clampVel((n.velocity ?? 96) * metricAccent(startStep) + jitter(3));

        timed.push({ step: startStep, on: true,  pitch, velocity });
        timed.push({ step: endStep,   on: false, pitch, velocity: 0 });
    }

    // Tri par step ; à step égal, off avant on
    timed.sort((a, b) => a.step - b.step || (a.on === b.on ? 0 : a.on ? 1 : -1));

    const events: MidiEvent[] = [];
    let prevStep = 0;   // step 0 du chunk : le silence de tête est conservé
    for (const t of timed) {
        const deltaMs = Math.max(0, (t.step - prevStep) * msPerStep);
        events.push(t.on
            ? { type: "note-on",  note: t.pitch, velocity: t.velocity, channel, deltaMs }
            : { type: "note-off", note: t.pitch, channel, deltaMs });
        prevStep = t.step;
    }
    return events;
}
