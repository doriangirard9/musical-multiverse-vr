import { MidiEvent } from "../types";

// ─── Conversion notes quantifiées → MidiEvent[] (mono ET polyphonie) ─────────
//
//   Partagé par les adapters Magenta (RNN et VAE). Émission ÉVÉNEMENTIELLE
//   triée : chaque note est éclatée en (on@start) et (off@end), tous les
//   événements sont triés par step (off avant on à step égal pour éviter un
//   retrigger sur la même hauteur), puis deltaMs = écart depuis l'événement
//   précédent. Le scheduler additionne ces deltas → temps absolus corrects,
//   polyphonie incluse (plusieurs note-on au même step = deltas nuls).

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
    /** Canal MIDI de sortie (9 = batterie GM). */
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
        const velocity = n.velocity ?? 90;

        timed.push({ step: startStep, on: true,  pitch, velocity });
        timed.push({ step: endStep,   on: false, pitch, velocity: 0 });
    }

    // Tri par step ; à step égal, off avant on
    timed.sort((a, b) => a.step - b.step || (a.on === b.on ? 0 : a.on ? 1 : -1));

    const events: MidiEvent[] = [];
    let prevStep = timed.length ? timed[0].step : 0;
    for (const t of timed) {
        const deltaMs = Math.max(0, (t.step - prevStep) * msPerStep);
        events.push(t.on
            ? { type: "note-on",  note: t.pitch, velocity: t.velocity, channel, deltaMs }
            : { type: "note-off", note: t.pitch, channel, deltaMs });
        prevStep = t.step;
    }
    return events;
}
