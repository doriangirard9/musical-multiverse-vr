// src/nodes/PianoRoll/strategies/DrumPadsStrategy.ts
import * as B from "@babylonjs/core";
import { GridStrategy } from "./GridStrategy";
import { DRUM_PAD_MAP } from "../../drums/DrumMidiMap";

const PADS = DRUM_PAD_MAP

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
