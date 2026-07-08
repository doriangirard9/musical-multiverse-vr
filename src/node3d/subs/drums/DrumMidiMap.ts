export const DRUM_PAD_MAP = [
    { label: "Kick", midi: 36 },
    { label: "Rimshot", midi: 37 },
    { label: "Snare", midi: 38 },
    { label: "Clap", midi: 39 },
    { label: "Low Tom", midi: 41 },
    { label: "CH", midi: 42 },
    { label: "High Tom", midi: 43 },
    { label: "OH", midi: 46 },
    { label: "Mid Tom", midi: 47 },
    { label: "Crash", midi: 49 },
    { label: "Ride", midi: 51 },
] as const

export function getDrumMidi(label: string, fallback: number): number {
    return DRUM_PAD_MAP.find(pad => pad.label.toLowerCase() === label.toLowerCase())?.midi ?? fallback
}
