// src/nodes/PianoRoll/strategies/GridStrategy.ts
import * as B from "@babylonjs/core";

export interface GridStrategy {
  /** Number of playable rows for this instrument */
  getRowCount(): number;

  /** Human-readable label for a row (e.g., "C4", "Snare") */
  getLabelForRow(row: number): string;

  /** Is the row a black-key style (for piano coloring)? */
  isBlackRow(row: number): boolean;

  /** MIDI number (or null if it doesn't emit MIDI) for this row */
  getMidiForRow(row: number): number | null;

  /** Optional: initial visible rows for UI */
  getSuggestedVisibleRows?(): number;

  /** Optional: per-row base color (fallback to white/black scheme if not provided) */
  getRowBaseColor?(row: number): B.Color3;
  
  apply?(gui: any): void;
  dispose?(gui: any): void;
}
