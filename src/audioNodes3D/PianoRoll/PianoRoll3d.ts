import * as BABYLON from "@babylonjs/core";
import { BoundingBox } from "../BoundingBox";

export interface WebPianoRoll {
  pianoRollInstance: { instanceId: string };
  synthInstance: any;
}

export interface MidiNote {
  tick: number;
  number: number;
  duration: number;
  velocity: number;
}

interface NoteButtonMesh extends BABYLON.Mesh {
  isActive: boolean;
  isPlaying: boolean;
}

export class PianoRoll3DDD {
  private scene: BABYLON.Scene;
  private audioContext: AudioContext;
  private webPianoRoll: WebPianoRoll;
  private rows: number;
  private cols: number;

  private buttonWidth = 2;
  private buttonHeight = 0.2;
  private buttonDepth = 2;
  private buttonSpacing = 0.5;

  private startX: number;
  private startZ: number;
  private tempo: number;
  private beatDuration: number;
  private timeSignatureDenominator = 4;
  private cellDuration: number;
  private ticksPerColumn = 6;

  private started = false;
  private startTime = 0;

  private notes: string[] = [
    "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
    "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4"
  ];

  private buttons: NoteButtonMesh[][] = [];
  private playhead!: BABYLON.Mesh;
  private isAKeyPressed = false;

  private pianoRollParent: BABYLON.TransformNode;

  public pattern: { length: number; notes: MidiNote[] } = { length: 0, notes: [] };

  constructor(
    scene: BABYLON.Scene,
    rows: number,
    cols: number,
    tempo = 60,
    audioContext: AudioContext,
    webPianoRoll: WebPianoRoll
  ) {
    this.scene = scene;
    this.rows = rows;
    this.cols = cols;
    this.tempo = tempo;
    this.audioContext = audioContext;
    this.webPianoRoll = webPianoRoll;

    this.startX = -(this.cols - 1) / 2 * (this.buttonWidth + this.buttonSpacing);
    this.startZ = -(this.rows - 1) / 2 * (this.buttonDepth + this.buttonSpacing);
    this.beatDuration = 60 / this.tempo;
    this.cellDuration = this.beatDuration / this.timeSignatureDenominator;
    this.pattern.length = this.cols * this.ticksPerColumn;

    this.pianoRollParent = new BABYLON.TransformNode("PianoRollParent", this.scene);

    this.setupKeyboardEvents();
    this.createGrid();
    this.createPlayhead();
    this.initActions();
  }

  public setParent(parent: BABYLON.Node): void {
    this.pianoRollParent.parent = parent;
  }

  private setupKeyboardEvents(): void {
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "a") this.isAKeyPressed = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.key.toLowerCase() === "a") this.isAKeyPressed = false;
    });
  }

  private convertNoteToMidi(note: string): number | null {
    const match = note.match(/^([A-G])(#?)(\d)$/);
    if (!match) return null;
    const [_, base, sharp, octaveStr] = match;
    const semitoneOffsets: Record<string, number> = {
      "C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4,
      "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11
    };
    const key = base + sharp;
    const offset = semitoneOffsets[key];
    const octave = parseInt(octaveStr);
    return 12 * (octave + 1) + offset;
  }

  private createGrid(): void {
    const material = new BABYLON.StandardMaterial("buttonMat", this.scene);
    material.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.8);

    for (let row = 0; row < this.rows; row++) {
      const rowButtons: NoteButtonMesh[] = [];
      for (let col = 0; col < this.cols; col++) {
        const button = BABYLON.MeshBuilder.CreateBox(`btn_${row}_${col}`, {
          width: this.buttonWidth,
          height: this.buttonHeight,
          depth: this.buttonDepth
        }, this.scene) as NoteButtonMesh;

        button.position.x = this.startX + col * (this.buttonWidth + this.buttonSpacing);
        button.position.y = 0.1;
        button.position.z = this.startZ + row * (this.buttonDepth + this.buttonSpacing);
        button.material = material.clone(`mat_${row}_${col}`);
        button.isActive = false;
        button.isPlaying = false;
        button.parent = this.pianoRollParent;

        rowButtons.push(button);
      }
      this.buttons.push(rowButtons);
    }
  }

  private createPlayhead(): void {
    this.playhead = BABYLON.MeshBuilder.CreateBox("playhead", {
      width: 0.1,
      height: 0.4,
      depth: this.rows * (this.buttonDepth + this.buttonSpacing)
    }, this.scene);
    this.playhead.position.y = 0.3;
    this.playhead.position.z = 0;
    const material = new BABYLON.StandardMaterial("playheadMat", this.scene);
    material.diffuseColor = new BABYLON.Color3(0, 1, 0);
    this.playhead.material = material;
    this.playhead.parent = this.pianoRollParent;
  }

  private initActions(): void {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const button = this.buttons[row][col];
        button.actionManager = new BABYLON.ActionManager(this.scene);
        button.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
          BABYLON.ActionManager.OnPickTrigger,
          () => {
            button.isActive = !button.isActive;
            (button.material as BABYLON.StandardMaterial).diffuseColor = button.isActive
              ? new BABYLON.Color3(1, 0, 0)
              : new BABYLON.Color3(0.2, 0.6, 0.8);
            this.updatePattern(row, col, button.isActive);
          }
        ));
      }
    }
  }

  private updatePattern(row: number, col: number, isActive: boolean): void {
    const note = this.notes[row];
    const midi = this.convertNoteToMidi(note);
    if (midi === null) return;

    const tick = col * this.ticksPerColumn;
    const idx = this.pattern.notes.findIndex(n => n.number === midi && n.tick === tick);

    if (isActive && idx === -1) {
      this.pattern.notes.push({ tick, number: midi, duration: 6, velocity: 100 });
    } else if (!isActive && idx !== -1) {
      this.pattern.notes.splice(idx, 1);
    }

    this.sendPatternToPianoRoll();
  }

  private sendPatternToPianoRoll(): void {
    const delegate = window?.WAMExtensions?.patterns?.getPatternViewDelegate(
      this.webPianoRoll.pianoRollInstance.instanceId
    );
    if (!delegate) return;
    delegate.setPatternState("default", this.pattern);
  }

  public update(): void {
    if (!this.started || !this.cellDuration) return;
    const elapsed = this.audioContext.currentTime - this.startTime;
    const cellIdx = (elapsed / this.cellDuration) % this.cols;
    const x = this.startX + cellIdx * (this.buttonWidth + this.buttonSpacing);
    this.playhead.position.x = x;
  }

  public start(): void {
    this.started = true;
    this.startTime = this.audioContext.currentTime;
    this.playhead.position.x = this.startX;
  }

  public stop(): void {
    this.started = false;
    this.playhead.position.x = this.startX;
  }

  public setTempo(bpm: number): void {
    this.tempo = bpm;
    this.beatDuration = 60 / bpm;
    this.cellDuration = this.beatDuration / this.timeSignatureDenominator;
  }
}
