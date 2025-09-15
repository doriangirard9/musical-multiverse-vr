// src/nodes/PianoRoll/strategies/DrumPadsStrategy.ts
import * as B from "@babylonjs/core";
import { GridStrategy } from "./GridStrategy";

/** Top→bottom labels + MIDI per GM-ish convention. Adjust to your sampler. */
const PADS = [
  { label: "Crash",   midi: 49 },
  { label: "Ride",    midi: 51 },
  { label: "HH Open", midi: 46 },
  { label: "HH Cl",   midi: 42 },
  { label: "Tom Hi",  midi: 50 },
  { label: "Tom Mid", midi: 47 },
  { label: "Tom Lo",  midi: 45 },
  { label: "Clap",    midi: 39 },
  { label: "Rim",     midi: 37 },
  { label: "Snare 2", midi: 40 },
  { label: "Snare",   midi: 38 },
  { label: "Kick 2",  midi: 36 },
  { label: "Kick",    midi: 35 },
  { label: "Perc 1",  midi: 60 },
  { label: "Perc 2",  midi: 61 },
  { label: "Perc 3",  midi: 62 },
];

export class DrumPadsStrategy implements GridStrategy {
  getRowCount(): number { return PADS.length; }
  getLabelForRow(row: number): string { return PADS[row]?.label ?? ""; }
  isBlackRow(row: number): boolean { return false; } // unified color for pads
  getMidiForRow(row: number): number | null { return PADS[row]?.midi ?? null; }
  getSuggestedVisibleRows(): number { return PADS.length; }
  getRowBaseColor(row: number): B.Color3 {
    // subtle alternating pad color
    return row % 2
      ? new B.Color3(0.85, 0.85, 0.85)
      : new B.Color3(0.75, 0.75, 0.75);
  }
}
