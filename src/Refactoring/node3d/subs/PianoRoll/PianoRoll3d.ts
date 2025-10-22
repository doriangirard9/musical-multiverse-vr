import { Matrix } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { MidiN3DConnectable } from "../../tools"; // Ensure this is a value export
import { Node3DContext } from "../../Node3DContext";
import * as B from "@babylonjs/core";
import { WamNode, WebAudioModule } from "@webaudiomodules/api";
import { WamInitializer } from "../../../app/WamInitializer";
import { PianoRollSettingsMenu } from "./PianoRollSettingsMenu";
import { WamTransportManager } from "./WamTransportManager"; // <-- shared transport
// strategies
import { GridStrategy } from "./grid/GridStrategy";
import { Piano88Strategy } from "./grid/Piano88Strategy";
import { DrumPadsStrategy } from "./grid/DrumPadsStrategy";
import { InputManager } from "../../../xr/inputs/InputManager";
import { XRManager } from "../../../xr/XRManager";
import { SceneManager } from "../../../app/SceneManager";
import { XRControllerManager } from "../../../xr/XRControllerManager";

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
// Local types
interface VisibleCell { row: number; col: number; }

/* cleanup ?
interface NoteButtonMesh extends B.Mesh {
  isActive: boolean;
  isPlaying: boolean;
  material: B.StandardMaterial;
  mode?: "normal" | "control" | "none";
}




// Extend Mesh to carry GUI cell flags (optional)
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
const COLOR_HOVER = new B.Color3(1, 1, 0);
class PianoRollN3DGUI implements Node3DGUI {
  // Scene / root
  public root: B.TransformNode;
  public tool: any;

  // Main pieces exposed to the controller
  public block!: B.AbstractMesh;
  public playhead!: B.Mesh;
  public menuButton!: B.Mesh;
  public midiOutput!: B.Mesh;
  public btnStartStop!: B.Mesh;
  public preventClickBetweenNotesMesh!: B.Mesh;

  // Scroll arrows
  private _btnScrollUp!: B.Mesh;
  private _btnScrollDown!: B.Mesh;

  // Grid sizing
  public rows: number = 88;   // will be overridden by strategy
  public cols: number = 16;

  // World bounds used for positioning
  public startX!: number;
  public endX!: number;
  public startZ!: number;
  public endZ!: number;

  // Cell sizing
  public buttonWidth  = 2;
  public buttonHeight = 0.2;
  public buttonDepth  = 0.5;
  public buttonSpacing = 0.2;
  public keyboardWidth = 3;

  // Scrolling properties
  public visibleRowCount: number = 20;
  private _startRowIndex: number = 30;

  // Thin instances for note cells
  public noteCell!: B.Mesh;
  private thinInstanceMatrices!: Float32Array;
  private thinInstanceColors!: Float32Array;
  private visibleCellMap: Map<number, VisibleCell> = new Map();
  private _clickObserver?: B.Observer<B.PointerInfo>;
  private _hoveredThinIndex: number | null = null;

  // Hover UI label (e.g., C4)
  private hoverLabel?: B.Mesh;

  // Keyboard strips + labels
  public keyBoard: B.Mesh[] = [];
  public keyLabels: B.Mesh[] = [];

  // Strategy (pluggable grid+keyboard behavior)
  public strategy: GridStrategy;

  // Label options
  public labelUsesMidiNumber = false; // optional: show MIDI instead of text label
  public btnClearPattern!: B.Mesh;

  constructor(
    public context: Node3DGUIContext,
    s1: GridStrategy = new Piano88Strategy(),
    _s2: DrumPadsStrategy = new DrumPadsStrategy()
  ) {
    const strategy = s1;
    this.strategy = strategy;

    const { babylon: _B, tools: T } = context;
    this.tool = T;

    this.root = new B.TransformNode("pianoroll root", context.scene);
    this.root.scaling.setAll(0.1);

    // Rows come from strategy
    this.rows = this.strategy.getRowCount();

    // Suggest visible rows (capped to available rows)
    const sugg = this.strategy.getSuggestedVisibleRows?.();
    if (sugg) this.visibleRowCount = Math.min(this.rows, sugg);

    if (this.rows < this.visibleRowCount) this.visibleRowCount = this.rows;

    // Default starting index clamped to rows
    this._startRowIndex = Math.min(this._startRowIndex, Math.max(0, this.rows - this.visibleRowCount));

   
    // Build
    void this.instantiate();
  }

  // Allow runtime hot-swap of strategy (e.g., connect to drum sampler)
  public setStrategy(strategy: GridStrategy) {
    this.strategy = strategy;
    this.rows = this.strategy.getRowCount();

    const sugg = this.strategy.getSuggestedVisibleRows?.();
    if (sugg) this.visibleRowCount = Math.min(this.rows, sugg);
    if (this.rows < this.visibleRowCount) this.visibleRowCount = this.rows;

    // Reset start window safely
    this._startRowIndex = Math.min(this._startRowIndex, Math.max(0, this.rows - this.visibleRowCount));

    // Rebuild visuals
    this.createGrid();
    this.updateRowVisibility();

    // Notify controller if attached
    (this as any).owner?.onGridChanged?.();
  }

  // ───────────────────────────────────────────────────────────────────────────
  public async instantiate(): Promise<void> {
    this.recalculateGridBoundaries();
    this.createGrid();
    this._createBaseMesh();
    this.createPlayhead();
    this._createScrollButtons();
    this.updateRowVisibility();
    this.recalculateGridBoundaries();
    this.createMenuButton();
    this.preventClickBetweenNotes();
    this.clearPatternButton()

    // Output port (position it at the right side of the base block)
    const baseY = this.block.position.y;
    const baseZ = this.block.position.z;
    const baseLength = this.block.getBoundingInfo().boundingBox.extendSize.x;

    this.midiOutput = B.CreateIcoSphere(
      "piano roll midi output",
      { radius: this.buttonWidth * 2 },
      this.context.scene
    );
    this.tool.MeshUtils.setColor(this.midiOutput, MidiN3DConnectable.OutputColor.toColor4());
    this.midiOutput.position.set(baseLength, baseY, baseZ + 1);
    this.midiOutput.scaling.setAll(0.5);
    this.midiOutput.parent = this.root;

    this.startStopButton();
  }

  // Add this inside the PianoRollN3DGUI class (same section as the other label helpers)

  /**
   * Create a text label and attach it to a single mesh.
   * - Uses DynamicTexture (same approach as keyboard labels).
   * - By default, positions slightly above the mesh center on Y.
   */
  public createLabelForMesh(
    target: B.Mesh,
    text: string,
    options?: {
      textColor?: string;
      background?: string;
      // If not provided, the plane will auto-fit the mesh top face (X/Z)
      width?: number;    // plane width in target local space (maps to X when rotated flat)
      height?: number;   // plane height in target local space (maps to Z when rotated flat)
      font?: string;     // base font family/weight, size will be auto-fit
      offset?: B.Vector3;
      textureSize?: { width: number; height: number };
      rotateFlatLikeKeyboard?: boolean; // default true
      padding?: number;  // padding on plane in local units (applied on X/Z)
      textPaddingPx?: number; // padding inside the texture in pixels
    }
  ): B.Mesh {
    const scene = this.context.scene;
  
    // Local half-extents of target (X, Y, Z) in target space
    const bi = target.getBoundingInfo();
    const ext = bi?.boundingBox.extendSize ?? new B.Vector3(0.5, 0.5, 0.5);
  
    // Plane should cover the top face: width -> X, height -> Z (since we rotate it flat)
    const padding = options?.padding ?? 0.02;
    const planeWidth  = options?.width  ?? Math.max(0.05, ext.x * 2 - padding * 2);
    const planeHeight = options?.height ?? Math.max(0.05, ext.z * 2 - padding * 2);
  
    const dtSize = options?.textureSize ?? { width: 1024, height: 512 }; // higher res to keep text crisp
    const dt = new B.DynamicTexture(`meshLabelDT_${target.name}_${Date.now()}`, dtSize, scene, true);
    dt.hasAlpha = true;
  
    const mat = new B.StandardMaterial(`meshLabelMat_${target.name}_${Date.now()}`, scene);
    mat.disableLighting = true;
    mat.emissiveTexture = dt;
    mat.opacityTexture  = dt;
  
    const plane = B.MeshBuilder.CreatePlane(
      `meshLabel_${target.name}_${Date.now()}`,
      { width: planeWidth, height: planeHeight },
      scene
    );
    plane.material   = mat;
    plane.isPickable = false;
  
    // Attach to mesh and place just above the top surface
    plane.parent = target;
    const defaultOffset = new B.Vector3(0, ext.y + 0.001, 0); // tiny lift to avoid z-fighting
    plane.position.copyFrom(options?.offset ?? defaultOffset);
  
    // Match keyboard behavior: fixed to mesh, lying flat
    plane.billboardMode = B.AbstractMesh.BILLBOARDMODE_NONE;
    if (options?.rotateFlatLikeKeyboard !== false) {
      plane.rotation.x = Math.PI / 2;
    }
  
    // Draw text and auto-fit inside the texture with padding
    const ctx = dt.getContext();
    const W = dt.getSize().width;
    const H = dt.getSize().height;
    const textPadding = options?.textPaddingPx ?? Math.floor(Math.min(W, H) * 0.08);
    const availW = W - textPadding * 2;
    const availH = H - textPadding * 2;
  
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = options?.background ?? "rgba(255,255,255,0)";
    ctx.fillRect(0, 0, W, H);
  
    // Auto-fit font size to available width/height
    const baseFont = options?.font ?? "bold 300px sans-serif";
    const fitFontSize = (maxW: number, maxH: number): number => {
      // quick binary search for font size
      let lo = 10, hi = 400, best = 10;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        ctx.font = baseFont.replace(/\d+px/, `${mid}px`);
        const m = ctx.measureText(text);
        const textW = m.width;
        // approximate text height via metrics if available; fallback to mid
        const ascent = (m as any).actualBoundingBoxAscent ?? mid;
        const descent = (m as any).actualBoundingBoxDescent ?? mid * 0.25;
        const textH = ascent + descent;
        if (textW <= maxW && textH <= maxH) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return best;
    };
  
    const fontPx = fitFontSize(availW, availH);
    ctx.font = baseFont.replace(/\d+px/, `${fontPx}px`);
    ctx.fillStyle = options?.textColor ?? "#000";
    const anyCtx = ctx as any;
    anyCtx.textAlign = "center";
    anyCtx.textBaseline = "middle";
    anyCtx.fillText(text, W / 2, H / 2);
  
    dt.update();
  
    return plane;
  }
  // ───────────────────────────────────────────────────────────────────────────
  // GRID + KEYBOARD

  public createGrid(): void {
    // clean previous
    this.keyLabels.forEach(l => l.dispose());
    this.keyLabels = [];
    this.keyBoard.forEach(k => k?.dispose());
    this.keyBoard = [];

    this.rows = this.strategy.getRowCount();

    // keyboard strips + labels
    for (let row = 0; row < this.rows; row++) {
      const colorBox = this._createColorBox(row);
      colorBox.parent = this.root;
      this.keyBoard[row] = colorBox;

      const labelText = this._labelTextForRow(row);
      const label = this._createKeyLabel(row, labelText);
      this.keyLabels[row] = label;
    }

    // note grid via thin instances
    this._buildNoteThinInstances();
  }

  private _buildNoteThinInstances(): void {
    if (this.noteCell) this.noteCell.dispose();

    this.noteCell = B.MeshBuilder.CreateBox(
      "noteCell",
      { width: this.buttonWidth, height: this.buttonHeight, depth: this.buttonDepth },
      this.context.scene
    );

    const material = new B.StandardMaterial("noteCellMaterial", this.context.scene);
    material.diffuseColor = new B.Color3(1, 1, 1);
    this.noteCell.material = material;
    this.noteCell.parent   = this.root;

    this.noteCell.isPickable = true;
    this.noteCell.thinInstanceEnablePicking = true;

    const instanceCount = this.visibleRowCount * this.cols;
    this.thinInstanceMatrices = new Float32Array(instanceCount * 16);
    this.thinInstanceColors   = new Float32Array(instanceCount * 4);

    this._fillVisibleWindowBuffers();

    // updatable buffers
    this.noteCell.thinInstanceSetBuffer("matrix", this.thinInstanceMatrices, 16, false);
    this.noteCell.thinInstanceSetBuffer("color",  this.thinInstanceColors,   4,  false);

    this._setupPointerHandlers();
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
        this.thinInstanceColors[off + 0] = COLOR_INACTIVE.r;
        this.thinInstanceColors[off + 1] = COLOR_INACTIVE.g;
        this.thinInstanceColors[off + 2] = COLOR_INACTIVE.b;
        this.thinInstanceColors[off + 3] = 1.0;

        this.visibleCellMap.set(instanceIndex, { row, col });
        instanceIndex++;
      }
    }
  }

  private _setupPointerHandlers(): void {
    const scene = this.context.scene;
    if (this._clickObserver) {
      scene.onPointerObservable.remove(this._clickObserver);
      this._clickObserver = undefined;
    }

    this._clickObserver = scene.onPointerObservable.add((pointerInfo) => {
      const p = pointerInfo.pickInfo;
      // Handle hover on move
      if (pointerInfo.type === B.PointerEventTypes.POINTERMOVE) {
        if (p && p.pickedMesh === this.noteCell && p.thinInstanceIndex != null) {
          const cell = this.visibleCellMap.get(p.thinInstanceIndex);
          if (cell) this._setHover(cell.row, cell.col, p.thinInstanceIndex);
        } else {
          // Clear hover when not over a note cell
          this._clearHover();
        }
        return;
      }

      // Handle clicks
      if (pointerInfo.type === B.PointerEventTypes.POINTERPICK) {
        if (!p || p.pickedMesh !== this.noteCell || p.thinInstanceIndex == null) return;
        const cell = this.visibleCellMap.get(p.thinInstanceIndex);
        if (cell && (this as any).owner) {
          ((this as any).owner).handleCellClick(cell.row, cell.col);
        }
      }
    });
  }

  private _setHover(row: number, col: number, thinIndex: number): void {
    if (this._hoveredThinIndex === thinIndex) return;

    // restore previous hovered cell color
    if (this._hoveredThinIndex != null) {
      const prev = this.visibleCellMap.get(this._hoveredThinIndex);
      const owner = (this as any).owner as { getCellVisualColor?: (r: number, c: number) => B.Color3 } | undefined;
      if (prev && owner?.getCellVisualColor) {
        const base = owner.getCellVisualColor(prev.row, prev.col);
        const off = this._hoveredThinIndex * 4;
        this.thinInstanceColors[off + 0] = base.r;
        this.thinInstanceColors[off + 1] = base.g;
        this.thinInstanceColors[off + 2] = base.b;
        this.thinInstanceColors[off + 3] = 1.0;
      }
    }

    // set new hovered color
    const off = thinIndex * 4;
    this.thinInstanceColors[off + 0] = COLOR_HOVER.r;
    this.thinInstanceColors[off + 1] = COLOR_HOVER.g;
    this.thinInstanceColors[off + 2] = COLOR_HOVER.b;
    this.thinInstanceColors[off + 3] = 1.0;
    this.noteCell.thinInstanceBufferUpdated("color");

    // Trigger haptic feedback on hover
    this._triggerHapticFeedback();

    // update label and position it above the specific note cell
    this._ensureHoverLabel();
    const label = this._labelTextForRow(row);
    this._drawHoverLabel((this.hoverLabel!.material as B.StandardMaterial).emissiveTexture as B.DynamicTexture, label);
    this.hoverLabel!.isVisible = true;
    this._positionHoverLabelAboveNote(row, col);
    
    // Set up continuous scale updates while hovering
    this._setupLabelScaleUpdates();

    this._hoveredThinIndex = thinIndex;
  }

  private _clearHover(): void {
    if (this._hoveredThinIndex == null) {
      if (this.hoverLabel) this.hoverLabel.isVisible = false;
      return;
    }

    const prev = this.visibleCellMap.get(this._hoveredThinIndex);
    const owner = (this as any).owner as { getCellVisualColor?: (r: number, c: number) => B.Color3 } | undefined;
    if (prev && owner?.getCellVisualColor) {
      const base = owner.getCellVisualColor(prev.row, prev.col);
      const off = this._hoveredThinIndex * 4;
      this.thinInstanceColors[off + 0] = base.r;
      this.thinInstanceColors[off + 1] = base.g;
      this.thinInstanceColors[off + 2] = base.b;
      this.thinInstanceColors[off + 3] = 1.0;
      this.noteCell.thinInstanceBufferUpdated("color");
    }
    this._hoveredThinIndex = null;
    if (this.hoverLabel) this.hoverLabel.isVisible = false;
    
    // Stop continuous scale updates
    this._stopLabelScaleUpdates();
  }

  private _ensureHoverLabel(): void {
    if (this.hoverLabel) return;
    const dt = new B.DynamicTexture("hoverNoteLabelDT", { width: 1024, height: 256 }, this.context.scene, true);
    dt.hasAlpha = true;
    const mat = new B.StandardMaterial("hoverNoteLabelMat", this.context.scene);
    mat.disableLighting = true;
    mat.emissiveTexture = dt;
    mat.opacityTexture = dt;
    mat.alpha = 0.9; // Make it more visible

    const plane = B.MeshBuilder.CreatePlane("hoverNoteLabel", { width: 2, height: 1 }, this.context.scene);
    plane.material = mat;
    plane.isPickable = false; // Ensure it doesn't block raycasting
    plane.parent = this.root;
    plane.billboardMode = B.AbstractMesh.BILLBOARDMODE_ALL; // Face the camera
    plane.isVisible = false;
    plane.renderingGroupId = 1; // Render on top of other objects
    this.hoverLabel = plane;
  }

  private _positionHoverLabelAboveNote(row: number, col: number): void {
    if (!this.hoverLabel) return;
    
    // Get the exact position of the hovered note cell
    const cellPosition = this.getCellLocalPosition(row, col);
    
    // Position the label directly above the note cell
    const x = cellPosition.x; // Same X as the note
    const y = cellPosition.y + this.buttonHeight * 2; // Above the note cell
    const z = cellPosition.z; // Same Z as the note
    
    this.hoverLabel.position.set(x, y, z);
    
    // Scale label based on distance to camera
    this._updateLabelScale();
  }

  private _updateLabelScale(): void {
    if (!this.hoverLabel) return;
    
    // Get camera position
    const camera = this.context.scene.activeCamera;
    if (!camera) return;
    
    // Calculate distance from label to camera
    const labelWorldPos = this.hoverLabel.getAbsolutePosition();
    const cameraPos = camera.position;
    const distance = B.Vector3.Distance(labelWorldPos, cameraPos);
    
    // Scale factors: closer = smaller, farther = bigger
    // Base distance of 5 units = normal size (scale 1.0)
    // At distance 10+ units, scale up to 2.0x
    // At distance 2 units, scale down to 0.5x
    const baseDistance = 5.0;
    const minDistance = 2.0;
    const maxDistance = 15.0;
    
    let scale = 1.0;
    if (distance > baseDistance) {
      // Scale up when far
      const farScale = Math.min(4.0, 1.0 + (distance - baseDistance) / (maxDistance - baseDistance));
      scale = farScale;
    } else if (distance < baseDistance) {
      // Scale down when close
      const closeScale = Math.max(0.5, 1.0 - (baseDistance - distance) / (baseDistance - minDistance));
      scale = closeScale;
    }
    
    // Apply the scale to the label
    this.hoverLabel.scaling.setAll(scale);
  }

  private _labelScaleObserver: B.Nullable<B.Observer<B.Scene>> = null;

  private _setupLabelScaleUpdates(): void {
    // Remove existing observer if any
    this._stopLabelScaleUpdates();
    
    // Set up continuous scale updates
    this._labelScaleObserver = this.context.scene.onBeforeRenderObservable.add(() => {
      if (this.hoverLabel && this.hoverLabel.isVisible) {
        this._updateLabelScale();
      }
    });
  }

  private _stopLabelScaleUpdates(): void {
    if (this._labelScaleObserver) {
      this.context.scene.onBeforeRenderObservable.remove(this._labelScaleObserver);
      this._labelScaleObserver = null;
    }
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

  // ───────────────────────────────────────────────────────────────────────────
  // Labels & keyboard strips

  private _labelTextForRow(row: number): string {
    if (!this.labelUsesMidiNumber) return this.strategy.getLabelForRow(row) ?? "";
    const midi = this.strategy.getMidiForRow(row);
    return midi != null ? String(midi) : (this.strategy.getLabelForRow(row) ?? "");
  }

  private _createKeyLabel(row: number, text: string): B.Mesh {
    const plane = B.MeshBuilder.CreatePlane(`keyLabel_${row}`, { width: 2.2, height: 0.7 }, this.context.scene);
    plane.parent    = this.root;
    plane.isPickable = false;
    plane.billboardMode = B.AbstractMesh.BILLBOARDMODE_Y;

    const dt = new B.DynamicTexture(`keyLabelDT_${row}`, { width: 512, height: 256 }, this.context.scene, true);
    dt.hasAlpha = true;

    const mat = new B.StandardMaterial(`keyLabelMat_${row}`, this.context.scene);
    mat.disableLighting  = true;
    mat.emissiveTexture  = dt;
    mat.opacityTexture   = dt;

    // Optional: if you want white text on "black rows"
    if (this.strategy.isBlackRow(row)) {
      mat.emissiveColor = new B.Color3(1, 1, 1);
    }
    plane.material = mat;

    this._drawKeyLabel(dt, text);

    const labelX = this.startX - (this.keyboardWidth + this.buttonSpacing);
    const visibleRangeCenter = (this.visibleRowCount - 1) / 2;
    const vRow = row - this._startRowIndex;
    const z = (vRow - visibleRangeCenter) * (this.buttonDepth + this.buttonSpacing);
    plane.position.set(labelX, this.buttonHeight * 1.1, z);
    plane.rotation.x = Math.PI / 2;
    plane.billboardMode = B.AbstractMesh.BILLBOARDMODE_NONE;

    return plane;
  }

  private _drawKeyLabel(dt: B.DynamicTexture, text: string): void {
    const ctx = dt.getContext();
    const W = dt.getSize().width;
    const H = dt.getSize().height;
    ctx.clearRect(0, 0, W, H);

    // background fully transparent for now
    ctx.fillStyle = "rgba(255,255,255,0)";
    ctx.fillRect(0, 0, W, H);

    ctx.font = "bold 140px sans-serif";
    ctx.fillStyle = this._isSharpLabel(text) ? "#fff" : "#000";
    const anyCtx = ctx as any;
    anyCtx.textAlign = "center";
    anyCtx.textBaseline = "middle";
    anyCtx.fillText(text, W / 2, H / 2);

    dt.update();
  }

  private _drawHoverLabel(dt: B.DynamicTexture, text: string): void {
    const ctx = dt.getContext();
    const W = dt.getSize().width;
    const H = dt.getSize().height;
    ctx.clearRect(0, 0, W, H);

    // Semi-transparent background for better visibility
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(0, 0, W, H);

    ctx.font = "bold 200px sans-serif";
    
    // Draw text outline for better visibility
    const anyCtx = ctx as any;
    anyCtx.textAlign = "center";
    anyCtx.textBaseline = "middle";
    
    // Black outline
    anyCtx.strokeStyle = "#000000";
    anyCtx.lineWidth = 8;
    anyCtx.strokeText(text, W / 2, H / 2);
    
    // Bright yellow text
    anyCtx.fillStyle = "#ffff00";
    anyCtx.fillText(text, W / 2, H / 2);

    dt.update();
  }

  private _isSharpLabel(text: string) {
    return text.includes("#") || text.includes("b");
  }

  private _createColorBox(row: number): B.Mesh {
    const positionZ = (row - (this.rows - 1) / 2) * (this.buttonDepth + this.buttonSpacing);
    const position = new B.Vector3(
      this.startX - (this.keyboardWidth + this.buttonSpacing),
      this.buttonHeight / 2,
      positionZ
    );

    const color =
      this.strategy.getRowBaseColor?.(row) ??
      (this.strategy.isBlackRow(row) ? COLOR_BLACK_KEY : COLOR_WHITE_KEY);

    return this.createBox(
      `color_box_${row}`,
      { width: this.keyboardWidth, height: this.buttonHeight, depth: this.buttonDepth },
      color,
      position,
      this.root
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Base mesh, playhead, menu, start/stop

  private _createBaseMesh() {
    this.block = this.createBox(
      "pianoRollBlock",
      {
        width:
          (this.endX - this.startX) +
          (this.keyboardWidth * 2 + this.buttonSpacing) +
          (this.keyboardWidth + this.buttonSpacing * 2),
        height: 0.2,
        depth:
          this.endZ - this.startZ +
          this.buttonDepth + this.buttonSpacing +
          (this.buttonDepth + this.buttonSpacing) * 2 + 0.8,
      },
      COLOR_BASE_MESH,
      new B.Vector3(0, 0, 0),
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

  public createPlayhead(): void {
    this.playhead = this.createBox(
      "playhead",
      { width: 0.1, height: 0.2, depth: this.endZ - this.startZ + this.buttonDepth },
      COLOR_PLAYING,
      new B.Vector3(this.getStartX(), 0.2, 0),
      this.root
    );
  }

  public startStopButton(): void {
    this.btnStartStop = this.createBox(
      "startStopButton",
      { width: 2, height: 0.6, depth: 0.4 },
      B.Color3.Green(),
      new B.Vector3(
        this.startX - (this.buttonWidth + this.buttonSpacing),
        0.2,
        this.endZ + (this.buttonDepth + this.buttonSpacing)
      ),
      this.root
    );
    this.btnStartStop.isVisible = true;
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

  private preventClickBetweenNotes() {
    this.preventClickBetweenNotesMesh = this.createBox(
      "noDragBox",
      {
        width: (this.endX - this.startX) + (this.buttonWidth),
        height: 0.3,
        depth: this.endZ - this.startZ + this.buttonDepth,
      },
      B.Color3.Black(),
      new B.Vector3(0, 0, 0),
      this.root
    );
    this.preventClickBetweenNotesMesh.isPickable = true;
    this.preventClickBetweenNotesMesh.visibility = 0;
  }

  private clearPatternButton(){
    this.btnClearPattern = this.createBox(
      "clearPatternButton",
      { width: 5, height: 0.2, depth: 1 },
      B.Color3.Black(),
      new B.Vector3(
        this.startX + (this.buttonWidth + this.buttonSpacing),
        0.2,
        this.endZ + (this.buttonDepth + this.buttonSpacing)
      ),
      this.root
    );
    this.btnClearPattern.isVisible = true;
    this.btnClearPattern.actionManager = new B.ActionManager(this.context.scene);
    this.createLabelForMesh(this.btnClearPattern,"Clear Notes",{textColor:"#fff"})
  }


  // ───────────────────────────────────────────────────────────────────────────
  // Scroll buttons

  private _createScrollButtons(): void {
    const upArrow   = this.createUpArrowMesh(this.context.scene, "btnScrollUp");
    const downArrow = this.createDownArrowMesh(this.context.scene, "btnScrollDown");

    const mat = new B.StandardMaterial("scrollMat", this.context.scene);
    mat.diffuseColor = COLOR_INACTIVE;
    upArrow.material   = mat;
    downArrow.material = mat.clone("scrollMatDown");

    // position (placed at right side)
    upArrow.position.set(this.endX + 2,  -0.2, -this.endZ / 3);
    downArrow.position.set(this.endX + 2,  0.2,  this.endZ / 3);

    // click handlers
    upArrow.actionManager   = new B.ActionManager(this.context.scene);
    downArrow.actionManager = new B.ActionManager(this.context.scene);

    upArrow.actionManager.registerAction(
      new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => this._scrollUp())
    );
    downArrow.actionManager.registerAction(
      new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => this._scrollDown())
    );

    upArrow.parent   = this.root;
    downArrow.parent = this.root;
    upArrow.scaling.setAll(2);
    downArrow.scaling.setAll(2);

    // hover highlight
    const highlightLayer = new B.HighlightLayer("highlightScrollButtons", this.context.scene);
    const addHighlight    = (m: B.Mesh) => highlightLayer.addMesh(m, B.Color3.Yellow());
    const removeHighlight = (m: B.Mesh) => highlightLayer.removeMesh(m);

    [upArrow, downArrow].forEach(mesh => {
      if (!mesh.actionManager) mesh.actionManager = new B.ActionManager(this.context.scene);
      mesh.actionManager.registerAction(
        new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, () => addHighlight(mesh))
      );
      mesh.actionManager.registerAction(
        new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger,  () => removeHighlight(mesh))
      );
    });

    this._btnScrollUp   = upArrow;
    this._btnScrollDown = downArrow;
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
  public scrollByRows(delta: number): void {
    const maxStart = Math.max(0, this.rows - this.visibleRowCount);
    const next = Math.min(maxStart, Math.max(0, this._startRowIndex + delta));
    if (next !== this._startRowIndex) {
      this._startRowIndex = next;
      this.updateRowVisibility();
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Layout helpers

  public getStartX(): number {
    return -((this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing) - this.buttonWidth / 2;
  }

  public recalculateGridBoundaries(): void {
    this.startX = -((this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);
    this.endX   =  ((this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);

    this.startZ = -((this.visibleRowCount - 1) / 2) * (this.buttonDepth + this.buttonSpacing);
    this.endZ   =  ((this.visibleRowCount - 1) / 2) * (this.buttonDepth + this.buttonSpacing);
  }

  public updateRowVisibility(): void {
    const endRowIndex = Math.min(this._startRowIndex + this.visibleRowCount, this.rows);
    const visibleRangeCenter = (this.visibleRowCount - 1) / 2;
    const owner = (this as any).owner as { rowControlBorders?: { [row: number]: B.Mesh[] } };

    for (let row = 0; row < this.rows; row++) {
      const isVisible = row >= this._startRowIndex && row < endRowIndex;
      const visualRowIndex = row - this._startRowIndex;
      const centeredZ = (visualRowIndex - visibleRangeCenter) * (this.buttonDepth + this.buttonSpacing);

      const colorBox = this.keyBoard[row];
      if (colorBox) {
        if (isVisible) {
          colorBox.position.z = centeredZ;
          colorBox.isVisible  = true;
        } else {
          colorBox.isVisible = false;
        }
      }

      const label = this.keyLabels[row];
      if (label) {
        label.isVisible = isVisible;
        if (isVisible) {
          label.position.z = centeredZ;
          label.position.y = this.buttonHeight * 1.1;
        }
      }

      if (owner?.rowControlBorders?.[row]) {
        const vIdx = row - this._startRowIndex;
        const cz   = (vIdx - visibleRangeCenter) * (this.buttonDepth + this.buttonSpacing);
        owner.rowControlBorders[row].forEach(bar => {
          bar.position.z = cz;
          bar.position.y = this.buttonHeight / 2;
          bar.isVisible  = isVisible;
        });
      }
    }

    this.refreshVisibleWindow();

    // update scroll button colors
    const matUp   = this._btnScrollUp.material as B.StandardMaterial;
    const matDown = this._btnScrollDown.material as B.StandardMaterial;

    matUp.diffuseColor   = this._startRowIndex > 0 ? COLOR_INACTIVE : COLOR_DISABLED;
    matDown.diffuseColor = this._startRowIndex + this.visibleRowCount < this.rows ? COLOR_INACTIVE : COLOR_DISABLED;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Arrow meshes

  public createUpArrowMesh(
    scene : B.Scene,
    name  = "upArrow",
    width = 1,
    height= 1.2,
    depth = 0.2
  ): B.Mesh {
    const w  = width  * 0.5;
    const r  = width  * 0.25;
    const hH = height * 0.6;
    const pts: B.Vector2[] = [
      new B.Vector2(-r, 0),
      new B.Vector2(-r, hH),
      new B.Vector2(-w, hH),
      new B.Vector2( 0, height),
      new B.Vector2( w, hH),
      new B.Vector2( r, hH),
      new B.Vector2( r, 0)
    ];

    const builder = new B.PolygonMeshBuilder(`${name}Triangulation`, pts, scene);
    const mesh    = builder.build(false, depth);
    mesh.bakeCurrentTransformIntoVertices();
    mesh.rotation.x = Math.PI; // orient into XZ plane
    return mesh;
  }

  public createDownArrowMesh(
    scene : B.Scene,
    name  = "downArrow",
    width = 1,
    height= 1.2,
    depth = 0.2
  ): B.Mesh {
    const arrow = this.createUpArrowMesh(scene, name, width, height, depth);
    arrow.rotation.x = Math.PI * 2;
    return arrow;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Haptic Feedback

  private _triggerHapticFeedback(): void {
    try {
      const xrManager = XRManager.getInstance();
      const scene = this.context.scene;

      const left = xrManager.xrInputManager.leftController;
      const right = xrManager.xrInputManager.rightController;

      if (!left && !right) return;

      // Cast a short ray from each controller to detect which is actually over the note grid
      const maxLen = 100;
      const isNoteCellHit = (pick: B.Nullable<B.PickingInfo>): boolean => !!(pick?.hit && pick.pickedMesh === this.noteCell);

      if (left) {
        const lray = new B.Ray(left.pointer.position, left.pointer.forward, maxLen);
        const lpick = scene.pickWithRay(lray);
        if (isNoteCellHit(lpick)) {
          XRControllerManager.Instance.triggerHapticFeedback('left', 0.3, 50);
          return; // Only one controller should vibrate per hover event
        }
      }

      if (right) {
        const rray = new B.Ray(right.pointer.position, right.pointer.forward, maxLen);
        const rpick = scene.pickWithRay(rray);
        if (isNoteCellHit(rpick)) {
          XRControllerManager.Instance.triggerHapticFeedback('right', 0.3, 50);
          return;
        }
      }
    } catch (error) {
      console.warn("Haptic feedback not available:", error);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Cleanup

  public async dispose(): Promise<void> {
    if (this.noteCell) this.noteCell.dispose();
    if (this._clickObserver) {
      this.context.scene.onPointerObservable.remove(this._clickObserver);
      this._clickObserver = undefined;
    }
    
    // Clean up label scale observer
    this._stopLabelScaleUpdates();
  }

  // For bounding volume consumers
  public get worldSize() { return 4; }
}



export class PianoRollN3D implements Node3D {
  // WAM / transport
  private wamInstance!: WebAudioModule;
  private transport: WamTransportManager;
  private unsubscribeTransport?: () => void;

  // Music grid timing
  private tempo = 120;               // BPM
  private timeSignatureNumerator = 4;
  private timeSignatureDenominator = 4; // also “beats per bar” in the step grid sense
  private ticksPerColumn = 6;        // 1 column = 6 ticks by default
  private beatDuration: number;      // seconds per beat (1/quarter)
  private cellDuration: number;      // seconds per column

  // State
  private context: Node3DContext;
  private gui: PianoRollN3DGUI;
  private menu!: PianoRollSettingsMenu;

  private pattern: Pattern;
  private isActive: boolean[][] = [];
  private mode: ("normal" | "control" | "none")[][] = [];
  public  rowControlBorders: { [row: number]: B.Mesh[] } = {};

  // Interaction
  private currentControlSequence: ControlSequence | null = null;
  private isAKeyPressed = false;

  // Async ready gate for WAM init + pattern delegate
  private ready!: Promise<void>;
  private isReady = false;
  private pendingPattern: Pattern | null = null;
  private midiOutputConnectable: InstanceType<typeof MidiN3DConnectable.ListOutput>;

  constructor(context: Node3DContext, gui: PianoRollN3DGUI) {
    this.context = context;
    this.gui = gui;

    // base timings
    this.beatDuration = 60 / this.tempo;
    this.cellDuration = this.beatDuration / this.timeSignatureDenominator;

    // initial empty pattern sized to columns
    this.pattern = { length: this.gui.cols * this.ticksPerColumn, notes: [] };

    // allocate UI bitmaps
    this.isActive = Array.from({ length: this.gui.strategy.getRowCount() }, () =>
      Array(this.gui.cols).fill(false)
    );
    this.mode = Array.from({ length: this.gui.strategy.getRowCount() }, () =>
      Array(this.gui.cols).fill("normal")
    );

    // back-reference for GUI callbacks
    (this.gui as any).owner = this;

    // bounding volume
    context.addToBoundingBox(gui.block);

    this.midiOutputConnectable = new this.context.tools.MidiN3DConnectable.ListOutput(
      "midioutput", 
      [gui.midiOutput], 
      "MIDI Output",
      // Callback when instrument connects
      (wamNode: WamNode) => {
          console.log(`Instrument connected: ${wamNode.instanceId}`);
          
          // Connect to WAM instance if it exists
          if (this.wamInstance?.audioNode) {
              this.wamInstance.audioNode.connectEvents(wamNode.instanceId);
          }
          
          if (wamNode.instanceId.includes("drum")) {
              this.gui.setStrategy(new DrumPadsStrategy());
          } else {
              this.gui.setStrategy(new Piano88Strategy());
          }
          this.onInstrumentConnected(wamNode);
      },
      // Callback when instrument disconnects
      (wamNode: WamNode) => {
          console.log(`Instrument disconnected: ${wamNode.instanceId}`);
          
          // Disconnect from WAM instance if it exists
          if (this.wamInstance?.audioNode) {
              this.wamInstance.audioNode.disconnectEvents(wamNode.instanceId);
          }
          
          this.onInstrumentDisconnected(wamNode);
      }
    );

    context.createConnectable(this.midiOutputConnectable);


    // ---- Shared Transport ----
    this.transport = WamTransportManager.getInstance(context.audioCtx);

    // Update start/stop button color on transport changes
    this.unsubscribeTransport = this.transport.onChange(() => {
      const mat = this.gui.btnStartStop.material as B.StandardMaterial;
      mat.diffuseColor = this.transport.getPlaying() ? B.Color3.Green() : B.Color3.Red();
    });

    // Scene render loop: drive playhead + highlight
    const scene = this.gui.context.scene;
    if (scene?.onBeforeRenderObservable) {
      scene.onBeforeRenderObservable.add(() => this.update());
    }

    // Start/Stop toggling
    this.toggleStartStopBtn();

    // Settings menu (columns/rows/tempo…)
    this.menu = new PianoRollSettingsMenu(this.gui.context.scene, this);

    // “A” to draw/extend control sequences
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "a") this.isAKeyPressed = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.key.toLowerCase() === "a") {
        this.isAKeyPressed = false;
        this.currentControlSequence = null;
      }
    });
    

// Right grip (squeeze) acts like holding "A" for long-note editing
InputManager.getInstance().right_squeeze.on_change.add((event) => {
  const active = (event.value ?? 0) > 0 || !!event.pressed; // optional: change 0 -> 0.1 as deadzone
  if (active) {
    this.isAKeyPressed = true;
  } else {
    this.isAKeyPressed = false;
    this.currentControlSequence = null;
  }
});

    // Bar/beat divider lines
    this.createBars();

    // --- Initialize WAM with a ready-gate; flush any pending pattern afterwards
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

    // Initialize button color to transport state
    const mat = this.gui.btnStartStop.material as B.StandardMaterial;
    mat.diffuseColor = this.transport.getPlaying() ? B.Color3.Green() : B.Color3.Red();
    this.handleClearPattern();
    

// initialize input managers
const im = InputManager.getInstance();
const xrManager = XRManager.getInstance();
const t = SceneManager.getInstance().getScene();

// Track if we're currently scrolling to prevent camera movement
let isScrolling = false;

// Helper function to get the piano roll instance from a mesh
const getPianoRollFromMesh = (mesh: B.AbstractMesh): PianoRollN3D | null => {
  // Check if the mesh is part of this piano roll's GUI
  if (mesh === this.gui.preventClickBetweenNotesMesh || 
    mesh === this.gui.block || 
      mesh === this.gui.playhead || 
      mesh === this.gui.menuButton || 
      mesh === this.gui.midiOutput ||
      mesh === this.gui.btnStartStop ||
      mesh === this.gui.btnClearPattern ||
      this.gui.keyBoard.includes(mesh as B.Mesh) ||
      this.gui.keyLabels.includes(mesh as B.Mesh) ||
      mesh === this.gui.noteCell) {
        console.log("Piano roll found");
    return this; // This is our piano roll instance
  }
  
  // Check if it's a thin instance of our note cell
  if (mesh === this.gui.noteCell) {
    console.log("Note cell found");
    return this;
  }
  
  return null;
};

// Helper function to perform raycast and get pointed piano roll
const getPointedPianoRollLeftController = (): PianoRollN3D | null => {
  const leftController = xrManager.xrInputManager.leftController;
  // const rightController = xrManager.xrInputManager.rightController;

  if (!leftController) return null;
  // if (!rightController) return null;
  
  // Create ray from controller
  const ray = new B.Ray(leftController.pointer.position, leftController.pointer.forward, 100);
  const pickResult = t.pickWithRay(ray);
  
  if (pickResult?.hit && pickResult.pickedMesh) {
    // Check if the picked mesh belongs to this piano roll
    return getPianoRollFromMesh(pickResult.pickedMesh);
  }
  
  return null;
};
const getPointedPianoRollRightController = (): PianoRollN3D | null => {

   const rightController = xrManager.xrInputManager.rightController;

  if (!rightController) return null;
  
  // Create ray from controller
  const ray = new B.Ray(rightController.pointer.position, rightController.pointer.forward, 100);
  const pickResult = t.pickWithRay(ray);
  
  if (pickResult?.hit && pickResult.pickedMesh) {
    // Check if the picked mesh belongs to this piano roll
    return getPianoRollFromMesh(pickResult.pickedMesh);
  }
  return null;
}


// Continuous scrolling while thumbstick is held
// @ts-ignore
let scrollInterval: NodeJS.Timeout | null = null;
const scrollSpeed = 200; // milliseconds between scroll steps

const startScrolling = (direction: number) => {
  if (scrollInterval) return; // Already scrolling
  
  const pointedPianoRollLeft = getPointedPianoRollLeftController() ;
  const pointedPianoRollRight = getPointedPianoRollRightController();
  

  if (pointedPianoRollLeft === this || pointedPianoRollRight === this) {
    isScrolling = true;
    // Completely disable movement features to prevent camera rotation
    xrManager.setMovement([]);
    
    // Start continuous scrolling
    scrollInterval = setInterval(() => {
      this.gui.scrollByRows(direction);
    }, scrollSpeed);
  }
};

const stopScrolling = () => {
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
  if (isScrolling) {
    isScrolling = false;
    // Re-enable both rotation and translation
    xrManager.setMovement(["rotation", "translation"]);
  }
};

// Start scrolling when thumbstick is pushed
im.left_thumbstick.on_up_down.add(() => startScrolling(-1));
im.left_thumbstick.on_down_down.add(() => startScrolling(1));

// Stop scrolling when thumbstick is released
im.left_thumbstick.on_up_up.add(() => stopScrolling());
im.left_thumbstick.on_down_up.add(() => stopScrolling());

// Also stop when thumbstick returns to center
im.left_thumbstick.on_value_change.add(({ x, y }) => {
  const deadzone = 0.1;
  const isInDeadzone = Math.abs(x) < deadzone && Math.abs(y) < deadzone;
  
  if (isInDeadzone) {
    stopScrolling();
  }
});
  }

  private onInstrumentConnected(_wamNode: WamNode) {
    // Handle new instrument connection
    // You can check wamNode.moduleId to determine instrument type
}

private onInstrumentDisconnected(_wamNode: WamNode) {
    // Handle instrument disconnection
}

  // ───────────────────────────────────────────────────────────────────────────
  // GUI ↔ Controller contract

  /** color requested by GUI when repainting visible thin instances */
  public getCellVisualColor(row: number, col: number): B.Color3 {
    if (this.isActive[row]?.[col]) {
      return this.mode[row][col] === "control" ? COLOR_LONG_PLAYING : COLOR_ACTIVE;
    }
    return COLOR_INACTIVE;
  }

  /** GUI click on a visible cell */
  public handleCellClick(row: number, col: number): void {
    if (this.isAKeyPressed) this.toggleNoteColorwithControl(row, col);
    else this.toggleNoteColor(row, col);
  }

  /** GUI strategy changed (e.g., switched to drum pads) */
  public onGridChanged(): void {
    const rows = this.gui.strategy.getRowCount();
    const cols = this.gui.cols;

    // reset on strategy switch (or remap MIDI→row if you prefer)
    this.isActive = Array.from({ length: rows }, () => Array(cols).fill(false));
    this.mode    = Array.from({ length: rows }, () => Array(cols).fill("normal"));
    this.pattern.notes = [];
    Object.values(this.rowControlBorders).flat().forEach(m => m.dispose());
    this.rowControlBorders = {};
    this.gui.repaintVisibleFromState();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // WAM / Transport

  private async wamInitializer() {
    // Use your hosted WAM (pianoroll plugin for pattern delegate)
    this.wamInstance = await WamInitializer.getInstance()
      .initWamInstance("https://www.webaudiomodules.com/community/plugins/burns-audio/pianoroll/index.js");

    // // Expose a MIDI Output tied to the plugin’s AudioNode (for your patchbay)
    // const output = new MidiN3DConnectable.Output(
    //   "midiOutput",
    //   [this.gui.midiOutput],
    //   "MIDI Output",
    //   this.wamInstance.audioNode
    // );
    // this.context.createConnectable(output);
    // Set the WamNode for the existing connectable
        // Connect any existing connections to the WAM instance
        this.midiOutputConnectable.connections.forEach(wamNode => {
          this.wamInstance.audioNode.connectEvents(wamNode.instanceId);
      });
  

    // Join shared transport group
    this.transport.register(this.wamInstance.audioNode);
    
    // connect to drump
      // Example with a web assembly instrument (Pro24 synth) WAM compiled from C-Major code)
  //   const wamInstanceDrum = await WamInitializer.getInstance()
  // .initWamInstance('https://www.webaudiomodules.com/community/plugins/burns-audio/drumsampler/index.js');
  // this.wamInstance.audioNode.connectEvents(wamInstanceDrum.instanceId);

    
  // // For the notes extension. Register the mapping
  // if(window.WAMExtensions.notes)
  // window.WAMExtensions.notes.addMapping(this.wamInstance.audioNode.instanceId, [wamInstanceDrum.instanceId]);
  
    // Check if note extension exists
    this.registerNoteListHandler();
	

	
  }

  registerNoteListHandler() {
		if (window.WAMExtensions && window.WAMExtensions.notes) {
			window.WAMExtensions.notes.addListener(this.wamInstance.instanceId, (notes) => {
				const noteList = notes;

        // update the 3D view, or at least store the notes
				//if (this.renderCallback) {
					//this.renderCallback()
				//}

        console.log("Note list from extension:", noteList);
			});
		}else console.warn("No note extension found");
  }

  /** advance playhead + live highlight via shared transport time */
  private update(): void {
    if (!this.gui?.playhead) return;

    const elapsed = this.transport.getElapsedSeconds();
    const currentCellFloat = (elapsed / this.cellDuration) % this.gui.cols;

    const x = (currentCellFloat * (this.gui.buttonWidth + this.gui.buttonSpacing))
      - (((this.gui.cols - 1) / 2) * (this.gui.buttonWidth + this.gui.buttonSpacing))
      - (this.gui.buttonWidth / 2);
    this.gui.playhead.position.x = x;

    const currentCol = Math.floor(currentCellFloat);
    this.highlightActiveButtons(currentCol);
  }

  private highlightActiveButtons(currentCol: number): void {
    for (let row = 0; row < this.gui.strategy.getRowCount(); row++) {
      if (this.isActive[row]?.[currentCol]) {
        this.gui._setVisibleCellColor(row, currentCol, COLOR_PLAYING);
        setTimeout(() => {
          if (this.isActive[row]?.[currentCol]) {
            const colr = (this.mode[row][currentCol] === "control") ? COLOR_LONG_PLAYING : COLOR_ACTIVE;
            this.gui._setVisibleCellColor(row, currentCol, colr);
          }
        }, this.cellDuration * 1000);
      }
    }
  }

  private toggleStartStopBtn(): void {
    if (!this.gui.btnStartStop.actionManager)
      this.gui.btnStartStop.actionManager = new B.ActionManager(this.gui.context.scene);

    this.gui.btnStartStop.actionManager.registerAction(
      new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
        this.transport.toggle();
        const mat = this.gui.btnStartStop.material as B.StandardMaterial;
        mat.diffuseColor = this.transport.getPlaying() ? B.Color3.Green() : B.Color3.Red();
      })
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pattern delegate (safe / deferred)

  private handleClearPattern(){
    this.gui.btnClearPattern.actionManager = new B.ActionManager(this.gui.context.scene);
    this.gui.btnClearPattern.actionManager.registerAction(
      new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
        this.pattern.notes = [];
        this.isActive = this.isActive.map(row => row.map(() => false));
        this.mode = this.mode.map(row => row.map(() => "normal"));
        Object.values(this.rowControlBorders).flat().forEach(m => m.dispose());
        this.rowControlBorders = {};
        this.gui.repaintVisibleFromState();
        this.context.notifyStateChange("pattern");
        this._safeSendPatternToPianoRoll();
      })
    );

  }
  private _safeSendPatternToPianoRoll(): void {
    try {
      if (!this.wamInstance?.audioNode) return;
      const instanceId = (this.wamInstance.audioNode as any).instanceId;
      if (!instanceId) return;

      const delegate = (window as any)?.WAMExtensions?.patterns?.getPatternViewDelegate(instanceId);
      if (!delegate) {
        // try again soon; avoids race if extension not yet registered
        queueMicrotask(() => this._safeSendPatternToPianoRoll());
        return;
      }
      delegate.setPatternState("default", this.pattern);
    } catch (e) {
      console.warn("sendPatternToPianoRoll deferred:", e);
    }
  }

  private _applyPattern(pattern: Pattern): void {
    this.pattern = pattern;

    const rows = this.gui.strategy.getRowCount();
    const cols = this.gui.cols;

    this.isActive = Array.from({ length: rows }, () => Array(cols).fill(false));
    this.mode     = Array.from({ length: rows }, () => Array(cols).fill("normal"));

    Object.values(this.rowControlBorders).flat().forEach(m => m.dispose());
    this.rowControlBorders = {};

    pattern.notes.forEach(note => {
      const row = this.rowForMidi(note.number);
      if (row < 0) return;

      const startCol = Math.floor(note.tick / this.ticksPerColumn);
      const nCols = Math.max(1, Math.round(note.duration / this.ticksPerColumn));

      for (let c = startCol; c < startCol + nCols && c < cols; c++) {
        this.isActive[row][c] = true;
        this.mode[row][c] = nCols > 1 ? "control" : "normal";
        const color = nCols > 1 ? COLOR_LONG_PLAYING : COLOR_ACTIVE;
        this.gui._setVisibleCellColor(row, c, color);
      }

      if (nCols > 1) {
        // Visual border bar for long note group
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
        border.parent = this.gui.root;

        const mat = new B.StandardMaterial(`mat_border_${row}_${startCol}`, this.gui.context.scene);
        mat.emissiveColor = B.Color3.Yellow();
        mat.disableLighting = true;
        mat.alpha = 0.5;
        border.material = mat;

        const centerCol = startCol + (nCols - 1) / 2;
        const p = this.gui.getCellLocalPosition(row, centerCol);
        border.position.copyFrom(p);

        border.actionManager = new B.ActionManager(this.gui.context.scene);
        border.actionManager.registerAction(
          new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => this.deleteControlSequence(row, startCol))
        );

        if (!this.rowControlBorders[row]) this.rowControlBorders[row] = [];
        this.rowControlBorders[row].push(border);
      }
    });

    this.gui.repaintVisibleFromState();
  }

  // Public setter with ready-gate + UI update
  public setPattern(pattern: Pattern): void {
    if (!this.isReady) {
      this.pendingPattern = pattern; // keep latest
      this._applyPattern(pattern);   // update UI immediately
      return;
    }
    this._applyPattern(pattern);
    this._safeSendPatternToPianoRoll();
  }

  public forceSyncPatternToPlugin(): void {
    if (!this.isReady) return;
    this._safeSendPatternToPianoRoll();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Editing helpers

  private midiForRow(row: number): number | null {
    return this.gui.strategy.getMidiForRow(row);
  }

  private rowForMidi(midi: number): number {
    const rows = this.gui.strategy.getRowCount();
    for (let r = 0; r < rows; r++) if (this.gui.strategy.getMidiForRow(r) === midi) return r;
    return -1;
  }

  private updatePattern(row: number, col: number, isActive: boolean): void {
    const midi = this.midiForRow(row);
    if (midi == null) return;

    const tick = col * this.ticksPerColumn;
    const idx = this.pattern.notes.findIndex(n => n.number === midi && n.tick === tick);

    if (isActive && idx === -1) {
      this.pattern.notes.push({ tick, number: midi, duration: this.ticksPerColumn, velocity: 100 });
    } else if (!isActive && idx !== -1) {
      this.pattern.notes.splice(idx, 1);
    }
    this._safeSendPatternToPianoRoll();
  }

  public toggleNoteColor(row: number, col: number): void {
    this.isActive[row][col] = !this.isActive[row][col];
    const color = this.isActive[row][col] ? COLOR_ACTIVE : COLOR_INACTIVE;
    this.gui._setVisibleCellColor(row, col, color);
    this.context.notifyStateChange("pattern");
    this.updatePattern(row, col, this.isActive[row][col]);
  }

  public toggleNoteColorwithControl(row: number, col: number): void {
    if (!this.isAKeyPressed) return;

    if (!this.currentControlSequence) {
      this.startNewControlSequence(row, col);
    } else {
      const seq = this.currentControlSequence;
      if (seq.row !== row) return console.warn("Cannot create sequence across multiple rows.");
      if (col < seq.startCol) return console.warn("Cannot create sequence backwards.");
      this.expandControlSequence(row, seq.startCol, col);
      this.context.notifyStateChange("pattern");
    }
  }

  private startNewControlSequence(row: number, col: number): void {
    this.isActive[row][col] = true;
    this.mode[row][col] = "control";
    this.gui._setVisibleCellColor(row, col, COLOR_LONG_PLAYING);

    const midiNumber = this.midiForRow(row);
    if (midiNumber == null) return;

    const tick = col * this.ticksPerColumn;
    this.pattern.notes.push({ tick, number: midiNumber, duration: this.ticksPerColumn, velocity: 100 });
    this._safeSendPatternToPianoRoll();

    const border = B.MeshBuilder.CreateBox(
      `groupBorder_${row}_${col}`,
      { width: this.gui.buttonWidth, height: 0.3, depth: this.gui.buttonDepth },
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

    const centerCol = (startCol + currentCol) / 2;
    const widthCols = currentCol - startCol + 1;
    const spacingRatio = this.gui.buttonSpacing / this.gui.buttonWidth;

    seq.borderMesh.scaling.x = widthCols + (widthCols - 1) * spacingRatio;
    const p = this.gui.getCellLocalPosition(row, centerCol);
    seq.borderMesh.position.copyFrom(p);

    this._safeSendPatternToPianoRoll();
    this.gui.repaintVisibleFromState();
  }

  private deleteControlSequence(row: number, startCol: number): void {
    const midiNumber = this.midiForRow(row);
    if (midiNumber == null) return;

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
    this.context.notifyStateChange("pattern");
    this.gui.repaintVisibleFromState();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Grid reconfig

  public setColumns(newColumnCount: number): void {
    // reset pattern + allocate arrays
    this.pattern.notes = [];
    this.pattern.length = newColumnCount * this.ticksPerColumn;
    this._safeSendPatternToPianoRoll();

    this.gui.cols = newColumnCount;

    const rows = this.gui.strategy.getRowCount();
    this.isActive = Array.from({ length: rows }, () => Array(newColumnCount).fill(false));
    this.mode    = Array.from({ length: rows }, () => Array(newColumnCount).fill("normal"));

    // rebuild visuals
    this.gui.keyBoard.forEach(key => key.dispose());
    this.gui.recalculateGridBoundaries();

    // resize base
    const newWidth = (this.gui.endX - this.gui.startX)
      + (this.gui.buttonWidth * 2 + this.gui.buttonSpacing)
      + (this.gui.buttonWidth + this.gui.buttonSpacing * 2);
    const currentWidth = this.gui.block.getBoundingInfo().boundingBox.extendSize.x * 2;
    this.gui.block.scaling.x = newWidth / currentWidth;

    this.gui.createGrid();
    this.gui.updateRowVisibility();

    // re-place midi output sphere
    const baseY = this.gui.block.position.y;
    const baseZ = this.gui.block.position.z;
    const baseLength = this.gui.block.getBoundingInfo().boundingBox.extendSize.x;
    this.gui.midiOutput.position.set(baseLength, baseY, baseZ + 1);

    if (this.gui.playhead) this.gui.playhead.position.x = this.gui.getStartX();

    // menu click opens settings
    this.gui.menuButton.actionManager = new B.ActionManager(this.gui.context.scene);
    this.gui.menuButton.actionManager.registerAction(
      new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => this.menu.show())
    );

    this.gui.repaintVisibleFromState();
    console.log(`Grid updated with ${newColumnCount} columns.`);
  }

  /**
   * Keep for compatibility: allows custom row counts (e.g., scale views).
   * With strategies, prefer switching strategy instead of setRows where possible.
   */
  public setRows(newRowCount: number): void {
    this.gui.keyBoard.forEach(key => key.dispose());
    // Note: if you use strategies, rows normally come from strategy.
    // Here we let GUI temporarily override for custom modes.
    (this.gui as any).rows = newRowCount;

    this.isActive = Array.from({ length: newRowCount }, () => Array(this.gui.cols).fill(false));
    this.mode     = Array.from({ length: newRowCount }, () => Array(this.gui.cols).fill("normal"));

    if ((this.gui as any).rows < this.gui.visibleRowCount) this.gui.visibleRowCount = (this.gui as any).rows;

    this.gui.recalculateGridBoundaries();
    this.gui.createGrid();
    this.gui.updateRowVisibility();

    this.gui.menuButton.actionManager = new B.ActionManager(this.gui.context.scene);
    this.gui.menuButton.actionManager.registerAction(
      new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => this.menu.show())
    );

    this.gui.repaintVisibleFromState();
    console.log(`Grid updated with ${newRowCount} rows.`);
  }

  public setTempo(bpm: number): void {
    // Update local timing constants first (UI/step grid speed)
    this.tempo = bpm;
    this.beatDuration = 60 / this.tempo;
    this.cellDuration = this.beatDuration / this.timeSignatureDenominator;
    // Broadcast to the shared transport (keeps musical position)
    this.transport.setTempo(bpm);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Bars / beats visuals

  public createBars(): void {
    // clear existing dividers if you keep references elsewhere (optional)
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

  // ───────────────────────────────────────────────────────────────────────────
  // Persistence hooks

  async getState(key: string): Promise<any> {
    if (key === "pattern") return { pattern: this.pattern, timestamp: Date.now() };
  }
  async setState(key: string, state: any): Promise<void> {
    if (key === "pattern") this.setPattern(state.pattern);
  }
  getStateKeys(): string[] { return ["pattern"]; }

  // ───────────────────────────────────────────────────────────────────────────
  // Cleanup

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
