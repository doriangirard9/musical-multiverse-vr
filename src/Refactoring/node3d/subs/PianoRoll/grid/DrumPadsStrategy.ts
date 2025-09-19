// src/nodes/PianoRoll/strategies/DrumPadsStrategy.ts
import * as B from "@babylonjs/core";
import { GridStrategy } from "./GridStrategy";

/** Top→bottom labels + MIDI per GM-ish convention. Adjust to your sampler. */
const PADS = [
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
