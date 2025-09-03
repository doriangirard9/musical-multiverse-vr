import { Matrix } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { MidiN3DConnectable } from "../../tools";
import { Node3DContext } from "../../Node3DContext";
import * as B from "@babylonjs/core";
import { WebAudioModule } from "@webaudiomodules/api";
import { WamInitializer } from "../../../app/WamInitializer";
import { PianoRollSettingsMenu } from "./PianoRollSettingsMenu";
import { WamTransportManager } from "./WamTransportManager"; // <-- shared transport

interface PatternNote {
  tick: number;
  number: number;
  duration: number;
  velocity: number;
}
interface Pattern {
  length: number;
  notes: PatternNote[];
}
interface ControlSequence {
  row: number;
  startCol: number;
  startTick: number;
  midiNumber: number;
  borderMesh: B.Mesh;
}
/* cleanup ?
interface NoteButtonMesh extends B.Mesh {
  isActive: boolean;
  isPlaying: boolean;
  material: B.StandardMaterial;
  mode?: "normal" | "control" | "none";
}

 */

// Color Constants
const COLOR_ACTIVE = new B.Color3(1, 0, 0);               // Red
const COLOR_INACTIVE = new B.Color3(0.2, 0.6, 0.8);       // Blue
const COLOR_PLAYING = new B.Color3(0, 1, 0);              // Green
const COLOR_LONG_PLAYING = new B.Color3(0.6588, 0.2, 0.8);// Purple
const COLOR_BLACK_KEY = new B.Color3(0.1, 0.1, 0.1);
const COLOR_WHITE_KEY = new B.Color3(1, 1, 1);
const COLOR_DISABLED = new B.Color3(0.2, 0.2, 0.2);
const COLOR_BASE_MESH = new B.Color3(0.5, 0.2, 0.2);

class PianoRollN3DGUI implements Node3DGUI {
  root
  public tool
  block!: B.AbstractMesh;
  playhead!: B.Mesh
  menuButton!: B.Mesh
  scrollUpButton!: B.Mesh
  scrollDownButton!: B.Mesh
  output!: B.Mesh;

  // Grid properties
  rows: number = 88;
  cols: number = 32;

  // grid edges
  startX!: number;
  endX!: number;
  startZ!: number;
  endZ!: number;

  buttonWidth = 0.5;
  buttonHeight = 0.2;
  buttonDepth = 0.5;
  buttonSpacing = 0.2;
  keyboardWidth = 3;

  // Scrolling properties
  visibleRowCount: number = 14;
  private _startRowIndex: number = 30;

  // Thin instances
  private noteCell!: B.Mesh;
  private thinInstanceMatrices!: Float32Array;
  private thinInstanceColors!: Float32Array;
  private visibleCellMap: Map<number, { row: number, col: number }> = new Map();
  private _clickObserver?: B.Observer<B.PointerInfo>;

  keyBoard: B.Mesh[] = [];
  private _btnScrollUp!: B.Mesh;
  private _btnScrollDown!: B.Mesh;

  public btnStartStop!: B.Mesh;

  // 88-key list
  notes: string[] = [
    "A0", "A#0", "B0",
    "C1", "C#1", "D1", "D#1", "E1", "F1", "F#1", "G1", "G#1", "A1", "A#1", "B1",
    "C2", "C#2", "D2", "D#2", "E2", "F2", "F#2", "G2", "G#2", "A2", "A#2", "B2",
    "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
    "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4",
    "C5", "C#5", "D5", "D#5", "E5", "F5", "F#5", "G5", "G#5", "A5", "A#5", "B5",
    "C6", "C#6", "D6", "D#6", "E6", "F6", "F#6", "G6", "G#6", "A6", "A#6", "B6",
    "C7", "C#7", "D7", "D#7", "E7", "F7", "F#7", "G7", "G#7", "A7", "A#7", "B7",
    "C8"
  ];

  constructor(public context: Node3DGUIContext) {
    const { babylon: B, tools: T } = context
    this.tool = T;
    this.root = new B.TransformNode("pianoroll root", context.scene)
    this.root.scaling.setAll(0.1);

    if (this.rows < this.visibleRowCount) this.visibleRowCount = this.rows;
    this.instantiate()
  }

  public async instantiate(): Promise<void> {
    this.recalculateGridBoundaries()
    this.createGrid();
    this._createBaseMesh();
    this.createPlayhead();
    this._createScrollButtons();
    this.updateRowVisibility();
    this.recalculateGridBoundaries()
    this.createMenuButton();

    // output position
    const baseY = this.block.position.y;
    const baseZ = this.block.position.z;
    const baseLength = this.block.getBoundingInfo().boundingBox.extendSize.x;

    this.output = B.CreateIcoSphere("piano roll midi output", { radius: this.buttonWidth * 4 }, this.context.scene);
    this.tool.MeshUtils.setColor(this.output, MidiN3DConnectable.OutputColor.toColor4())
    this.output.position.set(baseLength, baseY, baseZ + 1)
    this.output.scaling.setAll(0.5);
    this.output.parent = this.root;

    this.startStopButton();
    // this.menu = new PianoRollSettingsMenu(this.context.scene, this);
  }

  createGrid(): void {
    this.keyBoard = Array.from({ length: this.rows }, () => undefined as unknown as B.Mesh);

    // Keyboard color boxes (plain meshes for now)
    for (let row = 0; row < this.rows; row++) {
      const isBlackKey = this.isBlackKeyFromNoteName(this.notes[row]);
      const colorBox = this._createColorBox(row, isBlackKey);
      colorBox.parent = this.root;
      this.keyBoard[row] = colorBox;
    }

    // Note grid via thin instances
    this._buildNoteThinInstances();
  }

  private _buildNoteThinInstances(): void {
    if (this.noteCell) this.noteCell.dispose();

    this.noteCell = B.MeshBuilder.CreateBox("noteCell", {
      width: this.buttonWidth,
      height: this.buttonHeight,
      depth: this.buttonDepth
    }, this.context.scene);

    const material = new B.StandardMaterial("noteCellMaterial", this.context.scene);
    material.diffuseColor = new B.Color3(1, 1, 1);
    this.noteCell.material = material;
    this.noteCell.parent = this.root;

    this.noteCell.isPickable = true;
    this.noteCell.thinInstanceEnablePicking = true;

    const instanceCount = this.visibleRowCount * this.cols;
    this.thinInstanceMatrices = new Float32Array(instanceCount * 16);
    this.thinInstanceColors = new Float32Array(instanceCount * 4);

    this._fillVisibleWindowBuffers();

    // Updatable buffers
    this.noteCell.thinInstanceSetBuffer("matrix", this.thinInstanceMatrices, 16, false);
    this.noteCell.thinInstanceSetBuffer("color", this.thinInstanceColors, 4, false);

    this._setupClickHandler();
  }

  private _fillVisibleWindowBuffers(): void {
    this.visibleCellMap.clear();
    const visibleRangeCenter = (this.visibleRowCount - 1) / 2;
    const endRowIndex = Math.min(this._startRowIndex + this.visibleRowCount, this.rows);

    let instanceIndex = 0;
    for (let row = this._startRowIndex; row < endRowIndex; row++) {
      for (let col = 0; col < this.cols; col++) {
        const visualRowIndex = row - this._startRowIndex;
        const x = (col - (this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);
        const z = (visualRowIndex - visibleRangeCenter) * (this.buttonDepth + this.buttonSpacing);
        const y = this.buttonHeight / 2;

        Matrix.Translation(x, y, z).copyToArray(this.thinInstanceMatrices, instanceIndex * 16);

        const off = instanceIndex * 4;
        this.thinInstanceColors[off] = COLOR_INACTIVE.r;
        this.thinInstanceColors[off + 1] = COLOR_INACTIVE.g;
        this.thinInstanceColors[off + 2] = COLOR_INACTIVE.b;
        this.thinInstanceColors[off + 3] = 1.0;

        this.visibleCellMap.set(instanceIndex, { row, col });
        instanceIndex++;
      }
    }
  }

  private _setupClickHandler(): void {
    const scene = this.context.scene;
    if (this._clickObserver) {
      scene.onPointerObservable.remove(this._clickObserver);
      this._clickObserver = undefined;
    }

    this._clickObserver = scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== B.PointerEventTypes.POINTERPICK) return;
      const p = pointerInfo.pickInfo;
      if (!p || p.pickedMesh !== this.noteCell || p.thinInstanceIndex == null) return;

      const cell = this.visibleCellMap.get(p.thinInstanceIndex);
      if (cell && (this as any).owner) {
        ((this as any).owner as PianoRollN3D).handleCellClick(cell.row, cell.col);
      }
    });
  }

  public _setVisibleCellColor(row: number, col: number, color: B.Color3): void {
    for (const [idx, info] of this.visibleCellMap.entries()) {
      if (info.row === row && info.col === col) {
        const off = idx * 4;
        this.thinInstanceColors[off + 0] = color.r;
        this.thinInstanceColors[off + 1] = color.g;
        this.thinInstanceColors[off + 2] = color.b;
        this.thinInstanceColors[off + 3] = 1.0;
        this.noteCell.thinInstanceBufferUpdated("color");
        return;
      }
    }
  }

  // repaint visible from controller state
  public repaintVisibleFromState(): void {
    const owner = (this as any).owner as { getCellVisualColor?: (r: number, c: number) => B.Color3 } | undefined;
    if (!owner?.getCellVisualColor) return;

    for (const [idx, cell] of this.visibleCellMap.entries()) {
      const color = owner.getCellVisualColor(cell.row, cell.col);
      const off = idx * 4;
      this.thinInstanceColors[off + 0] = color.r;
      this.thinInstanceColors[off + 1] = color.g;
      this.thinInstanceColors[off + 2] = color.b;
      this.thinInstanceColors[off + 3] = 1.0;
    }
    this.noteCell.thinInstanceBufferUpdated("color");
  }

  public refreshVisibleWindow(): void {
    this._fillVisibleWindowBuffers();
    this.noteCell.thinInstanceBufferUpdated("matrix");
    this.repaintVisibleFromState();
  }

  public getCellLocalPosition(row: number, col: number): B.Vector3 {
    const visibleCenter = (this.visibleRowCount - 1) / 2;
    const vRow = row - this._startRowIndex;
    const x = (col - (this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);
    const z = (vRow - visibleCenter) * (this.buttonDepth + this.buttonSpacing);
    const y = this.buttonHeight / 2;
    return new B.Vector3(x, y, z);
  }

  public colToLocalX(col: number): number {
    return (col - (this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);
  }

  isBlackKeyFromNoteName(note?: string): boolean {
    if (!note) return false;
    return note.includes("#") || note.includes("b");
  }

  private _createColorBox(row: number, isBlack: boolean): B.Mesh {
    const positionZ = (row - (this.rows - 1) / 2) * (this.buttonDepth + this.buttonSpacing);
    const position = new B.Vector3(
      this.startX - (this.keyboardWidth + this.buttonSpacing),
      this.buttonHeight / 2,
      positionZ
    );

    const color = isBlack ? COLOR_BLACK_KEY : COLOR_WHITE_KEY;

    return this.createBox(
      `color_box_${row}`,
      { width: this.keyboardWidth, height: this.buttonHeight, depth: this.buttonDepth },
      color,
      position,
      this.root
    );
  }

  public createBox(
    name: string,
    size: { width: number; height: number; depth: number },
    color: B.Color3,
    position: B.Vector3,
    parent?: B.Node
  ): B.Mesh {
    const box = B.MeshBuilder.CreateBox(name, size, this.context.scene);

    const material = new B.StandardMaterial(`${name}_mat`, this.context.scene);
    material.diffuseColor = color;
    box.material = material;

    box.position = position.clone();
    if (parent) box.parent = parent;
    return box;
  }

  private _createBaseMesh() {
    this.block = this.createBox(
      "pianoRollBlock", {
      width: (this.endX - this.startX) + (this.keyboardWidth * 2 + this.buttonSpacing) + (this.keyboardWidth + this.buttonSpacing * 2),
      height: 0.2,
      depth: this.endZ - this.startZ + this.buttonDepth + this.buttonSpacing + (this.buttonDepth + this.buttonSpacing) * 2 + 0.8
    }, COLOR_BASE_MESH
      , new B.Vector3(0, 0, 0), this.root)
  }

  createPlayhead(): void {
    this.playhead = this.createBox(
      "playhead",
      { width: 0.1, height: 0.2, depth: this.endZ - this.startZ + this.buttonDepth },
      COLOR_PLAYING,
      new B.Vector3(this.getStartX(), 0.2, 0),
      this.root
    );
  }

  getStartX(): number {
    return -((this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing) - this.buttonWidth / 2;
  }

  private _createScrollButtons(): void {
    const scrollColor = COLOR_INACTIVE;
    const size = {
      width: this.endX - this.startX,
      height: this.buttonHeight,
      depth: this.buttonDepth,
    };

    // Create scroll up button
    this._btnScrollUp = this.createBox(
      "btnScrollUp",
      size,
      scrollColor,
      new B.Vector3(0, 0.2, 0),
      this.root
    );
    const scrollUpZ = this.startZ - this.buttonSpacing - this._btnScrollUp.getBoundingInfo().boundingBox.extendSize.z * 2;
    this._btnScrollUp.position.z = scrollUpZ;

    // Create scroll down button
    this._btnScrollDown = this.createBox(
      "btnScrollDown",
      size,
      scrollColor,
      new B.Vector3(0, 0.2, 0),
      this.root
    );

    const scrollDownZ = this.endZ + this.buttonSpacing + this._btnScrollUp.getBoundingInfo().boundingBox.extendSize.z * 2;
    this._btnScrollDown.position.z = scrollDownZ;

    // Add click actions
    this._btnScrollUp.actionManager = new B.ActionManager(this.context.scene);
    this._btnScrollDown.actionManager = new B.ActionManager(this.context.scene);

    this._btnScrollUp.actionManager.registerAction(
      new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => this._scrollUp())
    );

    this._btnScrollDown.actionManager.registerAction(
      new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => this._scrollDown())
    );
  }

  private _scrollUp(): void {
    if (this._startRowIndex > 0) {
      this._startRowIndex--;
      this.updateRowVisibility();
    }
  }
  private _scrollDown(): void {
    if (this._startRowIndex + this.visibleRowCount < this.rows) {
      this._startRowIndex++;
      this.updateRowVisibility();
    }
  }

  updateRowVisibility(): void {
    const endRowIndex = Math.min(this._startRowIndex + this.visibleRowCount, this.rows);
    const visibleRangeCenter = (this.visibleRowCount - 1) / 2;
    const owner = (this as any).owner as { rowControlBorders?: { [row: number]: B.Mesh[] } };

    for (let row = 0; row < this.rows; row++) {
      const isVisible = row >= this._startRowIndex && row < endRowIndex;

      const colorBox = this.keyBoard[row];
      if (colorBox) {
        if (isVisible) {
          const visualRowIndex = row - this._startRowIndex;
          const centeredZ = (visualRowIndex - visibleRangeCenter) * (this.buttonDepth + this.buttonSpacing);
          colorBox.position.z = centeredZ;
          colorBox.isVisible = true;
        } else {
          colorBox.isVisible = false;
        }
      }

      if (owner?.rowControlBorders?.[row]) {
        const visualRowIndex = row - this._startRowIndex;
        const centeredZ = (visualRowIndex - visibleRangeCenter) * (this.buttonDepth + this.buttonSpacing);
        owner.rowControlBorders[row].forEach(bar => {
          bar.position.z = centeredZ;
          bar.position.y = this.buttonHeight / 2;
          bar.isVisible = isVisible;
        });
      }
    }

    this.refreshVisibleWindow();

    const matUp = this._btnScrollUp.material as B.StandardMaterial;
    const matDown = this._btnScrollDown.material as B.StandardMaterial;

    matUp.diffuseColor = this._startRowIndex > 0 ? COLOR_INACTIVE : COLOR_DISABLED;
    matDown.diffuseColor = this._startRowIndex + this.visibleRowCount < this.rows ? COLOR_INACTIVE : COLOR_DISABLED;
  }

  recalculateGridBoundaries(): void {
    this.startX = -((this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);
    this.endX = ((this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);

    this.startZ = -((this.visibleRowCount - 1) / 2) * (this.buttonDepth + this.buttonSpacing);
    this.endZ = ((this.visibleRowCount - 1) / 2) * (this.buttonDepth + this.buttonSpacing);
  }

  public startStopButton(): void {
    this.btnStartStop = this.createBox(
      "startStopButton",
      { width: 2, height: 0.6, depth: 0.4 },
      B.Color3.Green(),
      new B.Vector3(this.startX - (this.buttonWidth + this.buttonSpacing), 0.2, this.endZ + (this.buttonDepth + this.buttonSpacing)),
      this.root
    );
    this.btnStartStop.isVisible = true
  }

  public createMenuButton(): void {
    this.menuButton = this.createBox(
      "menuButton",
      { width: 2, height: 0.6, depth: 0.4 },
      B.Color3.Black(),
      new B.Vector3(0, 0.6, 0),
      this.root
    );
    this.menuButton.position.x = this.endX + (this.buttonWidth + this.buttonSpacing);
    this.menuButton.position.z = -this.endZ - (this.buttonDepth + this.buttonSpacing);
  }

  async dispose(): Promise<void> {
    if (this.noteCell) this.noteCell.dispose();
    if (this._clickObserver) {
      this.context.scene.onPointerObservable.remove(this._clickObserver);
      this._clickObserver = undefined;
    }
  }

  get worldSize() { return 4 }
}

export class PianoRollN3D implements Node3D {
  private wamInstance!: WebAudioModule;
  private pattern: Pattern;
  private tempo: number = 120;
  private ticksPerColumn: number = 6;
  private beatDuration: number;
  private cellDuration: number;
  private timeSignatureNumerator = 4;
  private timeSignatureDenominator = 4;
  private context;
  private menu!: PianoRollSettingsMenu;
  private currentControlSequence: ControlSequence | null = null;
  private isAKeyPressed = false;

  private isActive: boolean[][] = [];
  private mode: ("normal" | "control" | "none")[][] = [];
  private rowControlBorders: { [row: number]: B.Mesh[] } = {};

  private transport: WamTransportManager;

  // --- NEW: readiness / queue ---
  //@ts-ignore
  private ready!: Promise<void>;
  private isReady = false;
  private pendingPattern: Pattern | null = null;

  private unsubscribeTransport?: () => void;

  constructor(context: Node3DContext, private gui: PianoRollN3DGUI) {
    //const { tools: T } = context
    this.context = context;
    this.beatDuration = 60 / this.tempo;
    this.cellDuration = this.beatDuration / this.timeSignatureDenominator;
    this.pattern = { length: this.gui.cols * this.ticksPerColumn, notes: [] };

    this.isActive = Array.from({ length: this.gui.rows }, () => Array(this.gui.cols).fill(false));
    this.mode = Array.from({ length: this.gui.rows }, () => Array(this.gui.cols).fill("normal"));

    (this.gui as any).owner = this;
    context.addToBoundingBox(gui.block)

    //const output = new T.MidiN3DConnectable.ListOutput("midioutput", [gui.output], "MIDI Output")
    //context.createConnectable(output)

    // ---- Shared Transport ----
    this.transport = WamTransportManager.getInstance(context.audioCtx);

    // Update play button color on transport changes
    this.unsubscribeTransport = this.transport.onChange(() => {
      const mat = this.gui.btnStartStop.material as B.StandardMaterial;
      mat.diffuseColor = this.transport.getPlaying() ? B.Color3.Green() : B.Color3.Red();
    });

    // Scene render loop
    const scene = gui.context.scene;
    if (scene && scene.onBeforeRenderObservable) {
      scene.onBeforeRenderObservable.add(() => this.update());
    }

    this.toggleStartStopBtn();
    this.menu = new PianoRollSettingsMenu(gui.context.scene, this);

    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "a") this.isAKeyPressed = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.key.toLowerCase() === "a") {
        this.isAKeyPressed = false;
        this.currentControlSequence = null;
      }
    });

    this.createBars();

    // --- NEW: Initialize WAM with a ready-gate and flush ---
    this.ready = this.wamInitializer()
      .then(() => {
        this.isReady = true;
        if (this.pendingPattern) {
          this._applyPattern(this.pendingPattern);
          this.pendingPattern = null;
          this._safeSendPatternToPianoRoll();
        }
      })
      .catch((e) => console.error("WAM init failed:", e));

    // Initialize button color to current transport state
    const mat = this.gui.btnStartStop.material as B.StandardMaterial;
    mat.diffuseColor = this.transport.getPlaying() ? B.Color3.Green() : B.Color3.Red();
  }

  // Expose intended display color (used by GUI repaint)
  public getCellVisualColor(row: number, col: number): B.Color3 {
    if (this.isActive[row][col]) {
      return this.mode[row][col] === "control" ? COLOR_LONG_PLAYING : COLOR_ACTIVE;
    }
    return COLOR_INACTIVE;
  }

  public handleCellClick(row: number, col: number): void {
    if (this.isAKeyPressed) this.toggleNoteColorwithControl(row, col);
    else this.toggleNoteColor(row, col);
  }

  private async wamInitializer() {
    this.wamInstance = await WamInitializer.getInstance()
      .initWamInstance("https://www.webaudiomodules.com/community/plugins/burns-audio/pianoroll/index.js");


    const output = new MidiN3DConnectable.Output(
      "midiOutput",
      [this.gui.output],
      "MIDI Output",
      this.wamInstance.audioNode
    );
    this.context.createConnectable(output);

    // Register plugin node with the shared transport
    this.transport.register(this.wamInstance.audioNode);
  }

  // Drive playhead from the shared elapsed time
  update(): void {
    if (!this.gui?.playhead) return;

    const elapsed = this.transport.getElapsedSeconds();
    const currentCell = (elapsed / this.cellDuration) % this.gui.cols;

    const x = (currentCell * (this.gui.buttonWidth + this.gui.buttonSpacing))
      - ((this.gui.cols - 1) / 2 * (this.gui.buttonWidth + this.gui.buttonSpacing)) - this.gui.buttonWidth / 2;
    this.gui.playhead.position.x = x;

    const currentCol = Math.floor(currentCell);
    this.highlightActiveButtons(currentCol);
  }

  highlightActiveButtons(currentCol: number): void {
    for (let row = 0; row < this.gui.rows; row++) {
      if (this.isActive[row][currentCol]) {
        this.gui._setVisibleCellColor(row, currentCol, COLOR_PLAYING);
        setTimeout(() => {
          if (this.isActive[row][currentCol]) {
            const colr = (this.mode[row][currentCol] === "control") ? COLOR_LONG_PLAYING : COLOR_ACTIVE;
            this.gui._setVisibleCellColor(row, currentCol, colr);
          }
        }, this.cellDuration * 1000);
      }
    }
  }

  // Start/Stop button controls the shared transport
  toggleStartStopBtn(): void {
    if (!this.gui.btnStartStop.actionManager)
      this.gui.btnStartStop.actionManager = new B.ActionManager(this.gui.context.scene);

    this.gui.btnStartStop.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
      this.transport.toggle();
      const mat = this.gui.btnStartStop.material as B.StandardMaterial;
      mat.diffuseColor = this.transport.getPlaying() ? B.Color3.Green() : B.Color3.Red();
    }));
  }

  // helpers
  convertNoteToMidi(note: string): number | null {
    const noteRegex = /^([A-Ga-g])(#|b)?(\d{1,2})$/;
    const semitoneOffsets: Record<string, number> = {
      'C': 0, 'C#': 1, 'Db': 1,
      'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'Fb': 4,
      'E#': 5, 'F': 5,
      'F#': 6, 'Gb': 6,
      'G': 7, 'G#': 8, 'Ab': 8,
      'A': 9, 'A#': 10, 'Bb': 10,
      'B': 11, 'Cb': 11,
      'B#': 0,
    };
    const match = note.match(noteRegex);
    if (!match) return null;

    const [, base, accidental, octaveStr] = match;
    const key = base.toUpperCase() + (accidental || '');
    const octave = parseInt(octaveStr, 10);

    const offset = semitoneOffsets[key];
    if (offset === undefined) return null;

    return 12 * (octave + 1) + offset;
  }

  // --- NEW: guarded delegate sender
  private _safeSendPatternToPianoRoll(): void {
    try {
      if (!this.wamInstance?.audioNode) return;

      const instanceId = (this.wamInstance.audioNode as any).instanceId;
      if (!instanceId) return;

      const delegate = (window as any)?.WAMExtensions?.patterns?.getPatternViewDelegate(instanceId);
      if (!delegate) {
        // try again soon; avoids crashing if extension not yet registered
        queueMicrotask(() => this._safeSendPatternToPianoRoll());
        return;
      }
      delegate.setPatternState("default", this.pattern);
    } catch (e) {
      console.warn("sendPatternToPianoRoll deferred:", e);
    }
  }

  // --- NEW: UI/state apply only (no plugin calls)
  private _applyPattern(pattern: Pattern): void {
    this.pattern = pattern;

    this.isActive = Array.from({ length: this.gui.rows }, () => Array(this.gui.cols).fill(false));
    this.mode = Array.from({ length: this.gui.rows }, () => Array(this.gui.cols).fill("normal"));

    Object.values(this.rowControlBorders).flat().forEach(m => m.dispose());
    this.rowControlBorders = {};

    pattern.notes.forEach(note => {
      const row = this.gui.notes.findIndex(n => this.convertNoteToMidi(n) === note.number);
      if (row < 0) return;

      const startCol = Math.floor(note.tick / this.ticksPerColumn);
      const nCols = Math.max(1, Math.round(note.duration / this.ticksPerColumn));

      for (let c = startCol; c < startCol + nCols && c < this.gui.cols; c++) {
        this.isActive[row][c] = true;
        this.mode[row][c] = nCols > 1 ? "control" : "normal";
        const color = nCols > 1 ? COLOR_LONG_PLAYING : COLOR_ACTIVE;
        this.gui._setVisibleCellColor(row, c, color);
      }

      if (nCols > 1) {
        const border = B.MeshBuilder.CreateBox(
          `groupBorder_${row}_${startCol}`,
          {
            width: this.gui.buttonWidth * nCols + this.gui.buttonSpacing * (nCols - 1),
            height: 0.3,
            depth: this.gui.buttonDepth
          },
          this.gui.context.scene
        );

        border.isPickable = true;
        border.actionManager = new B.ActionManager(this.gui.context.scene);
        border.actionManager.registerAction(
          new B.ExecuteCodeAction(
            B.ActionManager.OnPickTrigger,
            () => this.deleteControlSequence(row, startCol)
          )
        );
        const mat = new B.StandardMaterial(
          `mat_border_${row}_${startCol}`,
          this.gui.context.scene
        );
        mat.emissiveColor = B.Color3.Yellow();
        mat.disableLighting = true;
        mat.alpha = 0.5;
        border.material = mat;
        border.parent = this.gui.root;

        const centerCol = startCol + (nCols - 1) / 2; // fractional center
        const p = this.gui.getCellLocalPosition(row, centerCol);
        border.position.copyFrom(p);

        if (!this.rowControlBorders[row]) this.rowControlBorders[row] = [];
        this.rowControlBorders[row].push(border);
      }
    });

    this.gui.repaintVisibleFromState();
  }

  // --- UPDATED: public setter uses queue/ready-gate
  setPattern(pattern: Pattern): void {
    if (!this.isReady) {
      this.pendingPattern = pattern;     // keep latest desired pattern
      this._applyPattern(pattern);        // update UI immediately
      return;
    }
    this._applyPattern(pattern);
    this._safeSendPatternToPianoRoll();
  }

  // Keep this convenience for external callers if ever needed
  public forceSyncPatternToPlugin(): void {
    if (!this.isReady) return;
    this._safeSendPatternToPianoRoll();
  }

  updatePattern(row: number, col: number, isActive: boolean): void {
    const note = this.gui.notes[row];
    const midi = this.convertNoteToMidi(note);
    if (midi === null) return;

    const tick = col * this.ticksPerColumn;
    const index = this.pattern.notes.findIndex(n => n.number === midi && n.tick === tick);

    if (isActive && index === -1) {
      this.pattern.notes.push({ tick, number: midi, duration: 6, velocity: 100 });
    } else if (!isActive && index !== -1) {
      this.pattern.notes.splice(index, 1);
    }

    this._safeSendPatternToPianoRoll();
  }

  toggleNoteColor(row: number, col: number): void {
    this.isActive[row][col] = !this.isActive[row][col];
    const color = this.isActive[row][col] ? COLOR_ACTIVE : COLOR_INACTIVE;
    this.gui._setVisibleCellColor(row, col, color);
    this.context.notifyStateChange('pattern');
    this.updatePattern(row, col, this.isActive[row][col]);
  }

  toggleNoteColorwithControl(row: number, col: number): void {
    if (!this.isAKeyPressed) return;

    if (!this.currentControlSequence) {
      this.startNewControlSequence(row, col);
    } else {
      const seq = this.currentControlSequence;
      if (seq.row !== row) return console.warn("Cannot create sequence across multiple rows.");
      if (col < seq.startCol) return console.warn("Cannot create sequence backwards.");
      this.expandControlSequence(row, seq.startCol, col);
      this.context.notifyStateChange('pattern');
    }
  }

  private startNewControlSequence(row: number, col: number): void {
    this.isActive[row][col] = true;
    this.mode[row][col] = "control";
    this.gui._setVisibleCellColor(row, col, COLOR_LONG_PLAYING);

    const midiNumber = this.convertNoteToMidi(this.gui.notes[row]);
    if (midiNumber == null) return;
    const tick = col * this.ticksPerColumn;
    this.pattern.notes.push({ tick, number: midiNumber, duration: this.ticksPerColumn, velocity: 100 });
    this._safeSendPatternToPianoRoll();

    const border = B.MeshBuilder.CreateBox(
      `groupBorder_${row}_${col}`,
      {
        width: this.gui.buttonWidth,
        height: 0.3,
        depth: this.gui.buttonDepth
      },
      this.gui.context.scene
    );
    const mat = new B.StandardMaterial(`borderMat_${row}_${col}`, this.gui.context.scene);
    mat.emissiveColor = B.Color3.Yellow();
    mat.disableLighting = true;
    mat.alpha = 0.5;
    border.material = mat;
    border.isPickable = true;
    border.parent = this.gui.root;

    const p = this.gui.getCellLocalPosition(row, col);
    border.position.copyFrom(p);

    if (!this.rowControlBorders[row]) this.rowControlBorders[row] = [];
    this.rowControlBorders[row].push(border);

    this.currentControlSequence = { row, startCol: col, startTick: tick, midiNumber, borderMesh: border };

    border.actionManager = new B.ActionManager(this.gui.context.scene);
    border.actionManager.registerAction(
      new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => this.deleteControlSequence(row, col))
    );
    this._safeSendPatternToPianoRoll();
    this.gui.repaintVisibleFromState();
  }

  private expandControlSequence(row: number, startCol: number, currentCol: number): void {
    if (currentCol < startCol || !this.currentControlSequence) return;

    for (let c = startCol; c <= currentCol; c++) {
      this.isActive[row][c] = true;
      this.mode[row][c] = "control";
      this.gui._setVisibleCellColor(row, c, COLOR_LONG_PLAYING);
    }

    const seq = this.currentControlSequence;
    const noteObj = this.pattern.notes.find(n => n.number === seq.midiNumber && n.tick === seq.startTick);
    if (noteObj) {
      noteObj.duration = (currentCol - startCol + 1) * this.ticksPerColumn;
      this._safeSendPatternToPianoRoll();
    }

    const centerCol = (startCol + currentCol) / 2; // fractional center
    const widthCols = currentCol - startCol + 1;
    const spacingRatio = this.gui.buttonSpacing / this.gui.buttonWidth;

    seq.borderMesh.scaling.x = widthCols + (widthCols - 1) * spacingRatio;

    const p = this.gui.getCellLocalPosition(row, centerCol);
    seq.borderMesh.position.copyFrom(p);

    this._safeSendPatternToPianoRoll();
    this.gui.repaintVisibleFromState();
  }

  private deleteControlSequence(row: number, startCol: number): void {
    const midiNumber = this.convertNoteToMidi(this.gui.notes[row]);
    const tick = startCol * this.ticksPerColumn;
    const idx = this.pattern.notes.findIndex(n => n.number === midiNumber && n.tick === tick);

    const widthCols = idx !== -1 ? Math.round(this.pattern.notes[idx].duration / this.ticksPerColumn) : 1;

    if (idx !== -1) this.pattern.notes.splice(idx, 1);

    const border = this.gui.context.scene.getMeshByName(`groupBorder_${row}_${startCol}`) as B.Mesh;
    if (border) {
      for (let c = startCol; c < startCol + widthCols; c++) {
        this.isActive[row][c] = false;
        this.mode[row][c] = "none";
        this.gui._setVisibleCellColor(row, c, COLOR_INACTIVE);
      }
      border.dispose();
      const list = this.rowControlBorders[row];
      if (list) {
        this.rowControlBorders[row] = list.filter(m => m !== border);
        if (!this.rowControlBorders[row].length) delete this.rowControlBorders[row];
      }
    }
    this.currentControlSequence = null;
    this._safeSendPatternToPianoRoll();
    this.context.notifyStateChange('pattern');
    this.gui.repaintVisibleFromState();
  }

  public setColumns(newColumnCount: number): void {
    this.pattern.notes = [];
    this.pattern.length = newColumnCount * this.ticksPerColumn;
    this._safeSendPatternToPianoRoll();

    this.gui.cols = newColumnCount;

    this.isActive = Array.from({ length: this.gui.rows }, () => Array(newColumnCount).fill(false));
    this.mode = Array.from({ length: this.gui.rows }, () => Array(newColumnCount).fill("normal"));

    this.gui.keyBoard.forEach(key => key.dispose());

    this.gui.recalculateGridBoundaries();

    const newWidth = (this.gui.endX - this.gui.startX) + (this.gui.buttonWidth * 2 + this.gui.buttonSpacing) + (this.gui.buttonWidth + this.gui.buttonSpacing * 2);
    const currentWidth = this.gui.block.getBoundingInfo().boundingBox.extendSize.x * 2;
    this.gui.block.scaling.x = newWidth / currentWidth;

    this.gui.createGrid();
    this.gui.updateRowVisibility();

    const baseY = this.gui.block.position.y;
    const baseZ = this.gui.block.position.z;
    const baseLength = this.gui.block.getBoundingInfo().boundingBox.extendSize.x;
    this.gui.output.position.set(baseLength, baseY, baseZ + 1)
    if (this.gui.playhead) this.gui.playhead.position.x = this.gui.getStartX();

    this.gui.menuButton.actionManager = new B.ActionManager(this.gui.context.scene);
    this.gui.menuButton.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
      this.menu.show();
    }));

    this.gui.repaintVisibleFromState();
    console.log(`Grid updated with ${newColumnCount} columns.`);
  }

  public setRows(newRowCount: number): void {
    this.gui.keyBoard.forEach(key => key.dispose());
    this.gui.rows = newRowCount;

    this.isActive = Array.from({ length: newRowCount }, () => Array(this.gui.cols).fill(false));
    this.mode = Array.from({ length: newRowCount }, () => Array(this.gui.cols).fill("normal"));

    if (this.gui.rows < this.gui.visibleRowCount) this.gui.visibleRowCount = this.gui.rows;

    this.gui.recalculateGridBoundaries();
    this.gui.createGrid();
    this.gui.updateRowVisibility();

    this.gui.menuButton.actionManager = new B.ActionManager(this.gui.context.scene);
    this.gui.menuButton.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
      this.menu.show();
    }));

    this.gui.repaintVisibleFromState();
    console.log(`Grid updated with ${newRowCount} rows.`);
  }

  setTempo(bpm: number): void {
    // Update local timing constants first (UI/step grid speed)
    this.tempo = bpm;
    this.beatDuration = 60 / this.tempo;
    this.cellDuration = this.beatDuration / this.timeSignatureDenominator;
    // Broadcast to the shared transport (keeps musical position)
    this.transport.setTempo(bpm);
  }

  public createBars() {
    for (let col = 0; col <= this.gui.cols; col++) {
      const isBar = col % (this.timeSignatureNumerator * this.timeSignatureDenominator) === 0;
      const isBeat = col % this.timeSignatureDenominator === 0;
      if (!isBar && !isBeat) continue;

      const size = { width: 0.1, height: 0.19, depth: this.gui.endZ - this.gui.startZ + this.gui.buttonWidth };
      const colour = isBar ? new B.Color3(0, 0, 0) : new B.Color3(1, 1, 1);
      const posX = (col - (this.gui.cols - 1) / 2) *
        (this.gui.buttonWidth + this.gui.buttonSpacing) -
        (this.gui.buttonWidth + this.gui.buttonSpacing) / 2;
      const position = new B.Vector3(posX, 0.2, 0);

      const line = this.gui.createBox(`divider_${col}`, size, colour, position, this.gui.root);
      line.isPickable = false;
    }
  }

  async getState(key: string): Promise<any> {
    if (key === 'pattern') return { pattern: this.pattern, timestamp: Date.now() };
  }
  async setState(key: string, state: any): Promise<void> {
    if (key === 'pattern') this.setPattern(state.pattern);
  }
  getStateKeys(): string[] { return ['pattern'] }

  async dispose(): Promise<void> {
    if (this.unsubscribeTransport) this.unsubscribeTransport();
    if (this.wamInstance?.audioNode) this.transport.unregister(this.wamInstance.audioNode);
  }
}

export const PianoRollN3DFactory: Node3DFactory<PianoRollN3DGUI, PianoRollN3D> = {
  label: "pianoroll",
  description : "3D Piano Roll Sequencer, sources WAM from sequencer.party",
  tags: ["wam", "midi", "sequencer", "piano roll"],
  async createGUI(context) { return new PianoRollN3DGUI(context) },
  async create(context, gui) { return new PianoRollN3D(context, gui) },
}
