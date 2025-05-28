import * as B from "@babylonjs/core";
import { AudioNode3D } from "../AudioNode3D.ts";
import { AudioNodeState } from "../../network/types.ts";
import { BoundingBox } from "../BoundingBox.ts";
import { ControllerBehaviorManager } from "../../xr/BehaviorControllerManager.ts";
import { WamParameterData, WamParameterDataMap } from "@webaudiomodules/api";
import { Wam3D } from "../Wam3D.ts";
import { CustomParameter, IAudioNodeConfig, IWamConfig } from "../types.ts";
import { ParamBuilder } from "../parameters/ParamBuilder.ts";
import { Instrument3D } from "../Instrument3D.ts";
import * as GUI from "@babylonjs/gui";
import { log } from "tone/build/esm/core/util/Debug";
import { start } from "tone";
import { PianoRollSettingsMenu } from "./PianoRollSettingsMenu.ts";
import { CommonShadowLightPropertyGridComponent } from "@babylonjs/inspector/components/actionTabs/tabs/propertyGrids/lights/commonShadowLightPropertyGridComponent";
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

interface NoteButtonMesh extends B.Mesh {
  isActive: boolean;
  isPlaying: boolean;
  material: B.StandardMaterial; 
}


export class PianoRoll3D extends Wam3D {
  private rows: number;
  private cols: number;
  private tempo: number;
  private buttonWidth = 2;
  private buttonHeight = 0.2;
  private buttonDepth = 0.5;
  private buttonSpacing = 0.2;
  private startX!: number;
  private endX!: number;
  private startZ!: number;
  private endZ!: number;
  private beatDuration: number;
  
  private cellDuration: number;
  private timeSignatureNumerator = 4;
  private timeSignatureDenominator = 4;
  private started = false;
  private startTime = 0;
  private notes: string[] = [];
  private buttons: NoteButtonMesh[][] = [];
  private playhead!: B.Mesh;
  private buttonMaterial!: B.StandardMaterial;
  private pattern: Pattern;
  private isAKeyPressed = false;
  private ticksPerColumn = 6;
  private menu!  : PianoRollSettingsMenu;
  private menuButton!: B.Mesh;
    private btnStartStop!: B.Mesh;
    private isBtnStartStop: boolean = true;

  // scrolling 
    private _btnScrollUp!: B.Mesh;
    private _btnScrollDown!: B.Mesh;
    // New properties for row navigation
    private _startRowIndex: number = 0; // Index of the first visible row
    private _visibleRowCount: number = 7; // Number of rows visible at one time
    private colorBoxes: B.Mesh[] = [];

    // private displayedRows: number = 14; // Total number of rows (total notes)
    // private _noteLabels: B.Mesh[] = [];
    
  constructor(
    scene: B.Scene,
    audioCtx: AudioContext,
    id: string,
    config: IWamConfig,
    s: IAudioNodeConfig
  ) {
    super(scene, audioCtx, id, config, s);
    this.rows =16;
    this.cols = 16;
    this.tempo = 60;
    if(this.rows<this._visibleRowCount)
    this._visibleRowCount = this.rows

this._recalculateGridBoundaries();
    this.beatDuration = 60 / this.tempo;
    this.cellDuration = this.beatDuration / this.timeSignatureDenominator;


    this.notes = [
      "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
      "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4"
  ];

  this.pattern = {
      length: this.cols * this.ticksPerColumn,
      notes: []
  };
  
  this._scene.registerBeforeRender(() => {
    this.update();
  });
  


  }

    public async instantiate(): Promise<void> {
      try {
        if (!this._scene || !this._audioCtx) {
          throw new Error("Scene or AudioContext is not initialized.");
        }
  
        this._wamInstance = await this._initWamInstance(this._config.url);
        this._createBaseMesh();
        this.createGrid();
        this.createPlayhead();
        this.initActions();
        this._initActionManager();
        this._createScrollButtons();
        this._updateRowVisibility();
        this.createMenuButton();
        // output position
        const baseY = this.baseMesh.position.y;
        const baseZ = this.baseMesh.position.z;
  
        const baseLength = this.baseMesh.getBoundingInfo().boundingBox.extendSize.x;
        this._createOutputMidi(new B.Vector3(baseLength, baseY, baseZ+1));
        
          this.start();
        this._wamInstance.audioNode.scheduleEvents({
          type: "wam-transport",
          data: {
            playing: true,
            timeSigDenominator: 4,
            timeSigNumerator: 4,
            currentBar: 0,
            currentBarStarted: this._audioCtx.currentTime,
            tempo: this.tempo,
          },
        });
  
        this.boundingBox = new BoundingBox(this, this._scene, this.id, this._app).boundingBox;
        
        this.startStopButton();
        this.menu = new PianoRollSettingsMenu(this._scene, this);

      } catch (error) {
        console.error("Error instantiating PianoRoll:", error);
      }
    }
    private _recalculateGridBoundaries(): void {
      // Horizontal (X axis)
      this.startX = -((this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);
      this.endX = ((this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);
    
      // Vertical (Z axis) for rows
      this.startZ = -((this._visibleRowCount - 1) / 2) * (this.buttonDepth + this.buttonSpacing);
      this.endZ = ((this._visibleRowCount - 1) / 2) * (this.buttonDepth + this.buttonSpacing);
    }
    
    public startStopButton(): void {
      this.btnStartStop = this._createBox(
        "startStopButton",
        { width: 2, height: 0.6, depth: 0.4 },
        B.Color3.Green(),
        new B.Vector3(this.startX - (this.buttonWidth + this.buttonSpacing), 0.2, this.endZ + (this.buttonDepth + this.buttonSpacing)),
        this.baseMesh
      );

      // add click action to toggle start stop button
      this.btnStartStop.actionManager = new B.ActionManager(this._scene);
      this.btnStartStop.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
      
      const mat = this.btnStartStop.material as B.StandardMaterial;
      // check if color is green
      if (this.isBtnStartStop) {
        this.stop()

        this.isBtnStartStop = false;
        mat.diffuseColor = B.Color3.Red();
        // textBlock.text = "Stop";
        } else {
          this.start()

          this.isBtnStartStop = true;
          mat.diffuseColor = B.Color3.Green();
          // textBlock.text = "Start";
        }
      }));

      
      
    }

    // create box that can be clicked to show a menu
    public createMenuButton(): void {
      this.menuButton = this._createBox(
        "menuButton",
        { width: 2, height: 0.6, depth: 0.4 },
        B.Color3.Black(),
        new B.Vector3(0, 0.6, 0),
        this.baseMesh
      );

      // add click action to start stop button
      this.menuButton.actionManager = new B.ActionManager(this._scene);
      this.menuButton.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
        this.menu.show();
      }));
}
    public setRows(newRowCount: number): void {
      // Clear existing buttons
      this.buttons.forEach(row => {
          row.forEach(button => button.dispose());
      });
  
      // Clear existing colorBoxes
      this.colorBoxes.forEach(colorBox => {
          colorBox.dispose();
      });
  
      // Update the row count
      this.rows = newRowCount;
  
      // Adjust the visible row count if necessary
      if (this.rows < this._visibleRowCount) {
          this._visibleRowCount = this.rows;
      }
  
      // Recalculate grid boundaries
      this._recalculateGridBoundaries();

      // Recreate the grid with the new number of rows
      this.createGrid();
      this._updateRowVisibility();
      console.log(`Grid updated with ${newRowCount} rows.`);
      this.initActions()  
    }

  public setColumns(newColumnCount: number): void {
    // Clear existing buttons from the scene
    this.buttons.forEach(row => {
        row.forEach(button => button.dispose());
    });

    // Clear existing colorBoxes
      this.colorBoxes.forEach(colorBox => {
        colorBox.dispose();
    });

    // clear exeisting this.pattern
    this.pattern.notes = [];
    this.pattern.length = newColumnCount * this.ticksPerColumn;
    this.sendPatternToPianoRoll();

    // Update the column count
    this.cols = newColumnCount;

    // Recalculate grid boundaries
    this._recalculateGridBoundaries();

    // Recompute desired width
    const newWidth = (this.endX - this.startX) + (this.buttonWidth * 2 + this.buttonSpacing) + (this.buttonWidth + this.buttonSpacing * 2);
    
    // Apply scaling to baseMesh instead of recreating
    const currentWidth = this.baseMesh.getBoundingInfo().boundingBox.extendSize.x * 2;
    this.baseMesh.scaling.x = newWidth / currentWidth;

    // Recreate the grid with the new number of columns
    this.createGrid();
    this._updateRowVisibility();
    console.log(`Grid updated with ${newColumnCount} columns.`);

    // Update the playhead to span the new grid
    if (this.playhead) {
        this.playhead.position.x = this.getStartX();
    }
this.initActions()}


    protected _createBaseMesh(): void {
        this.baseMesh = B.MeshBuilder.CreateBox('box', {          
          //width: (diff between buttons) + (adjust for button)+ (keyboard size)
          width: (this.endX - this.startX ) + (this.buttonWidth * 2 + this.buttonSpacing) + (this.buttonWidth + this.buttonSpacing*2) , 
          height: 0.2,
          depth: this.endZ - this.startZ + this.buttonDepth+ this.buttonSpacing + (this.buttonDepth+this.buttonSpacing) * 2 // for scrolling buttons
         }, this._scene);

        const material = new B.StandardMaterial('material', this._scene);
        material.diffuseColor = new B.Color3(0.5, 0.2, 0.2);
        this.baseMesh.material = material;
    }
    private _createScrollButtons(): void {
      const scrollColor = new B.Color3(0.2, 0.6, 0.8);
      const size = {
        width: this.endX - this.startX,
        height: this.buttonHeight,
        depth: this.buttonDepth,
      };
    
      // Create scroll up button
      this._btnScrollUp = this._createBox(
        "btnScrollUp",
        size,
        scrollColor,
        new B.Vector3(0, 0.2, 0), // Temporary z, will be adjusted next
        this.baseMesh
      );
    
      const scrollUpZ = this.startZ - this.buttonSpacing - this._btnScrollUp.getBoundingInfo().boundingBox.extendSize.z * 2;
      this._btnScrollUp.position.z = scrollUpZ;
    
      // Create scroll down button
      this._btnScrollDown = this._createBox(
        "btnScrollDown",
        size,
        scrollColor,
        new B.Vector3(0, 0.2, 0), // Temporary z, will be adjusted next
        this.baseMesh
      );
    
      const scrollDownZ = this.endZ + this.buttonSpacing + this._btnScrollUp.getBoundingInfo().boundingBox.extendSize.z * 2;
      this._btnScrollDown.position.z = scrollDownZ;
    
      // Add click actions
      this._btnScrollUp.actionManager = new B.ActionManager(this._scene);
      this._btnScrollDown.actionManager = new B.ActionManager(this._scene);
    
      this._btnScrollUp.actionManager.registerAction(
        new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => this._scrollUp())
      );
    
      this._btnScrollDown.actionManager.registerAction(
        new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => this._scrollDown())
      );
    }
    

  private _scrollUp(): void {
    // Scroll up if we're not already at the top
    if (this._startRowIndex > 0) {
      this._startRowIndex--;
      this._updateRowVisibility();
    }
  }

  private _scrollDown(): void {
    // Scroll down if we're not already at the bottom
    if (this._startRowIndex + this._visibleRowCount < this.rows) {
      this._startRowIndex++;
      this._updateRowVisibility();
    }
  }
  private _updateRowVisibility(): void {
    // Calculate the end row index
    const endRowIndex = Math.min(
        this._startRowIndex + this._visibleRowCount,
        this.rows
    );

    // Compute the visual center for visible rows
    const visibleRangeCenter = (this._visibleRowCount - 1) / 2;

    for (let row = 0; row < this.rows; row++) {
        const isVisible = row >= this._startRowIndex && row < endRowIndex;

        // === Update the Keyboard (colorBox) as well ===
        if (this.colorBoxes[row]) {
            const colorBox = this.colorBoxes[row];

            if (isVisible) {
                // Calculate the visual row index relative to the visible window
                const visualRowIndex = row - this._startRowIndex;

                // Centering logic for colorBox (the keyboard)
                const centeredPosition = (visualRowIndex - visibleRangeCenter) * (this.buttonDepth + this.buttonSpacing);

                // Apply the new position without modifying the original spacing
                colorBox.position.z = centeredPosition;
                colorBox.isVisible = true;
            } else {
                colorBox.isVisible = false;
            }
        }

        // === Update the Main Grid Buttons ===
        for (let col = 0; col < this.buttons[row].length; col++) {
            const button = this.buttons[row][col];

            if (isVisible) {
                // Sync the button position with the visual index
                const visualRowIndex = row - this._startRowIndex;
                const centeredPosition = (visualRowIndex - visibleRangeCenter) * (this.buttonDepth + this.buttonSpacing);

                button.position.z = centeredPosition;
                button.isVisible = true;
            } else {
                button.isVisible = false;
            }
        }
    }

    // Disable the scroll up button if at the top
    const materialUp = this._btnScrollUp.material as B.StandardMaterial;
    materialUp.diffuseColor = this._startRowIndex > 0 
        ? new B.Color3(0.2, 0.6, 0.8) // Active
        : new B.Color3(0.2, 0.2, 0.2); // Inactive

    // Disable the scroll down button if at the bottom
    const materialDown = this._btnScrollDown.material as B.StandardMaterial;
    materialDown.diffuseColor = this._startRowIndex + this._visibleRowCount < this.rows
        ? new B.Color3(0.2, 0.6, 0.8) // Active
        : new B.Color3(0.2, 0.2, 0.2); // Inactive
}


  convertNoteToMidi(note: string): number | null {
    const noteRegex = /^([A-G])(#?)(\d)$/;
    const semitoneOffsets: Record<string, number> = {
      'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4,
      'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9,
      'A#': 10, 'B': 11
    };

    const match = note.match(noteRegex);
    if (!match) return null;
    const [_, base, sharp, octaveStr] = match;
    const key = base + (sharp || '');
    const octave = parseInt(octaveStr, 10);
    return 12 * (octave + 1) + semitoneOffsets[key];
  }
  isBlackKeyFromNoteName(note: string): boolean {
    const blackKeys = ["C#3", "D#3", "F#3", "G#3", "A#3", "C#4", "D#4", "F#4", "G#4", "A#4"];
    return blackKeys.includes(note);
  }

  addLabelToButton(buttonMesh: B.Mesh, text: string): void {
    const textPlane = B.MeshBuilder.CreatePlane(`${buttonMesh.name}_textPlane`, { width: 2, height: 2 }, this._scene);
    textPlane.parent = buttonMesh;
    textPlane.position.y = 0.11;
    textPlane.rotation.x = Math.PI / 2;
    textPlane.isPickable = false;

    const textMaterial = new B.StandardMaterial(`${buttonMesh.name}_textMaterial`, this._scene);
    textMaterial.specularColor = new B.Color3(0, 0, 0);
    textMaterial.emissiveColor = new B.Color3(1, 1, 1);
    textPlane.material = textMaterial;

    const textTexture = new B.DynamicTexture(`${buttonMesh.name}_texture`, { width: 128, height: 128 }, this._scene, true);
    textMaterial.diffuseTexture = textTexture;
    textMaterial.useAlphaFromDiffuseTexture = true;

    const ctx = textTexture.getContext();
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = "bold 48px Arial";
    // @ts-ignore
    ctx.textAlign = "center";
        // @ts-ignore
    ctx.textBaseline = "middle";
    ctx.fillStyle = "white";
    ctx.fillText(text, 64, 64);
    textTexture.update();
  }


sendPatternToPianoRoll(): void {
  const delegate = window?.WAMExtensions?.patterns?.getPatternViewDelegate(
    this._wamInstance.audioNode.instanceId
  );
  if (!delegate) return;
  delegate.setPatternState("default", this.pattern);
  console.log("sendPatternToPianoRoll", this.pattern);
}


updatePattern(row: number, col: number, isActive: boolean): void {
  const note = this.notes[row];
  const midi = this.convertNoteToMidi(note);
  if (midi === null) return;

  const tick = col * this.ticksPerColumn;
  const index = this.pattern.notes.findIndex(n => n.number === midi && n.tick === tick);

  if (isActive && index === -1) {
    this.pattern.notes.push({ tick, number: midi, duration: 6, velocity: 100 });
  } else if (!isActive && index !== -1) {
    this.pattern.notes.splice(index, 1);
  }

  this.sendPatternToPianoRoll();

  // ✅ send to network
  this._app.networkManager?.setPattern(this.id, this.pattern);
}

getStartX(): number {
  return -((this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing) - this.buttonWidth / 2;
}

getButton(row: number, col: number): NoteButtonMesh | null {
  if (this.buttons[row] && this.buttons[row][col]) {
      return this.buttons[row][col] as NoteButtonMesh;
  }
  return null;
}
public connect(destination: AudioNode): void {
  // @ts-ignore
  this._wamInstance.audioNode.connectEvents(destination.instanceId);
}


createGrid(): void {
  this.buttons = Array.from({ length: this.rows }, () => []);
  this.colorBoxes = Array.from({ length: this.rows }, () => undefined as unknown as B.Mesh);

  for (let row = 0; row < this.rows; row++) {
    const isBlackKey = this.isBlackKeyFromNoteName(this.notes[row]);
    const colorBox = this._createColorBox(row, isBlackKey);
    this.colorBoxes[row] = colorBox;

    for (let col = 0; col < this.cols; col++) {
      const button = this._createNoteButton(row, col, colorBox.position.z);
      this.buttons[row].push(button);
    }
  }
}

private _createBox(
  name: string,
  size: { width: number; height: number; depth: number },
  color: B.Color3,
  position: B.Vector3,
  parent?: B.Node
): B.Mesh {
  const box = B.MeshBuilder.CreateBox(name, size, this._scene);

  const material = new B.StandardMaterial(`${name}_mat`, this._scene);
  material.diffuseColor = color;
  box.material = material;

  box.position = position.clone();

  if (parent) {
    box.parent = parent;
  }

  return box;
}
private _createColorBox(row: number, isBlack: boolean): B.Mesh {
  const positionZ = (row - (this.rows - 1) / 2) * (this.buttonDepth + this.buttonSpacing);
  const position = new B.Vector3(
    this.startX - (this.buttonWidth + this.buttonSpacing),
    this.buttonHeight / 2,
    positionZ
  );

  const color = isBlack ? new B.Color3(0.1, 0.1, 0.1) : new B.Color3(1, 1, 1);

  return this._createBox(
    `color_box_${row}`,
    { width: this.buttonWidth, height: this.buttonHeight, depth: this.buttonDepth },
    color,
    position,
    this.baseMesh
  );
}

private _createNoteButton(row: number, col: number, z: number): NoteButtonMesh {
  const positionX = (col - (this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);
  const position = new B.Vector3(positionX, this.buttonHeight / 2, z);

  const button = this._createBox(
    `button${row}_${col}`,
    { width: this.buttonWidth, height: this.buttonHeight, depth: this.buttonDepth },
    new B.Color3(0.2, 0.6, 0.8),
    position,
    this.baseMesh
  ) as NoteButtonMesh;

  button.isActive = false;
  button.isPlaying = false;

  return button;
}


createPlayhead(): void {
  this.playhead = this._createBox(
    "playhead",
    { width: 0.1, height: 0.2, depth: this.endZ - this.startZ + this.buttonDepth },
    new B.Color3(0, 1, 0),
    new B.Vector3(this.getStartX(), 0.2, 0),
    this.baseMesh
  );
  
}

update(): void {
  if (!this.started) return;

  const elapsed = this.audioContext.currentTime - this.startTime;
  const currentCell = (elapsed / this.cellDuration) % this.cols;

  const x = (currentCell * (this.buttonWidth + this.buttonSpacing))
      - ((this.cols - 1) / 2 * (this.buttonWidth + this.buttonSpacing)) - this.buttonWidth / 2;
  this.playhead.position.x = x;

  const currentCol = Math.floor(currentCell);
  this.highlightActiveButtons(currentCol);
}

highlightActiveButtons(currentCol: number): void {
  for (let row = 0; row < this.rows; row++) {
      const button = this.getButton(row, currentCol);
      
      if (button && button.isActive) {
          button.material.diffuseColor = new B.Color3(0, 1, 0); // Green for active
          
          setTimeout(() => {
              if (button.isActive) {
                  button.material.diffuseColor = button.isActive
                      ? new B.Color3(1, 0, 0) // Red for active
                      : new B.Color3(0.2, 0.6, 0.8); // Blue for inactive
              }
          }, this.cellDuration * 1000);
      }
  }
}

initActions(): void {
  for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
          const button = this.buttons[row][col];
          button.actionManager = new B.ActionManager(this._scene);

          button.actionManager.registerAction(new B.ExecuteCodeAction(
              B.ActionManager.OnPickTrigger,
              () => this.toggleNoteColor(row, col)
          ));
      }
  }
}

toggleNoteColor(row: number, col: number): void {
  const button = this.getButton(row, col);
  if (!button) return;

  button.isActive = !button.isActive;
  const material = button.material as B.StandardMaterial; // <-- Cast to StandardMaterial
  material.diffuseColor = button.isActive
      ? new B.Color3(1, 0, 0) // Red for active
      : new B.Color3(0.2, 0.6, 0.8); // Blue for inactive

  this.updatePattern(row, col, button.isActive);
}

start(): void {
  this.started = true;
  this.startTime = this.audioContext.currentTime;
  this._wamInstance.audioNode.scheduleEvents({
    type: "wam-transport",
    data: {
      playing: true,
      timeSigDenominator: 4,
      timeSigNumerator: 4,
      currentBar: 0,
      currentBarStarted: this._audioCtx.currentTime,
      tempo: this.tempo,
    },
  });
}

stop(): void {
  this.started = false;
  this.playhead.position.x = this.getStartX();
  this._wamInstance.audioNode.scheduleEvents({
    type: "wam-transport",
    data: {
      playing: false,
      timeSigDenominator: 4,
      timeSigNumerator: 4,
      currentBar: 0,
      currentBarStarted: this._audioCtx.currentTime,
      tempo: this.tempo,
    },
  });
}

setTempo(bpm: number): void {
  this.tempo = bpm;
  this.beatDuration = 60 / this.tempo;
  this.cellDuration = this.beatDuration / this.timeSignatureDenominator;
  this.stop()
  this.start()
  // this.sendPatternToPianoRoll();
}







  protected _createOutputMidi(position: B.Vector3): void {
      this.outputMeshMidi = B.MeshBuilder.CreateSphere('outputSphereMidi', { diameter: 0.5 }, this._scene);
      this.outputMeshBigMidi = B.MeshBuilder.CreateSphere('outputBigSphereMidi', { diameter: 1 }, this._scene);
      this.outputMeshBigMidi.parent = this.outputMeshMidi;
      this.outputMeshBigMidi.visibility = 0;
      this.outputMeshMidi.parent = this.baseMesh;
      position.x = position.x + this.outputMeshMidi.getBoundingInfo().boundingBox.extendSize.x;
      this.outputMeshMidi.position = position;

      // color
      const inputSphereMaterial = new B.StandardMaterial('material', this._scene);
      inputSphereMaterial.diffuseColor = new B.Color3(0, 0, 1);
      this.outputMeshMidi.material = inputSphereMaterial;

      this.outputMeshMidi.actionManager = new B.ActionManager(this._scene);
      this.outputMeshBigMidi.actionManager = new B.ActionManager(this._scene);

      const highlightLayer = new B.HighlightLayer(`hl-outputMidi-${this.id}`, this._scene);

      this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
          highlightLayer.addMesh(this.outputMeshMidi as B.Mesh, B.Color3.Blue());
      }));

      this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
          highlightLayer.removeMesh(this.outputMeshMidi as B.Mesh);
      }));

      // action manager
      this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
          this.ioObservable.notifyObservers({ type: 'outputMidi', pickType: 'down', node: this });
      }));
      this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
          this.ioObservable.notifyObservers({ type: 'outputMidi', pickType: 'up', node: this });
      }));
      this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (): void => {
          this.ioObservable.notifyObservers({ type: 'outputMidi', pickType: 'out', node: this });
      }));
  }

  public setPattern(pattern: Pattern): void {
    this.pattern = pattern;
  
    // Reset grid
    this.buttons.forEach(row => row.forEach(btn => {
      btn.isActive = false;
      btn.material.diffuseColor = new B.Color3(0.2, 0.6, 0.8);
    }));
  
    // Apply new pattern
    pattern.notes.forEach(note => {
      const col = Math.floor(note.tick / this.ticksPerColumn);
      const row = this.notes.findIndex(n => this.convertNoteToMidi(n) === note.number);
      if (row >= 0 && col >= 0 && row < this.rows && col < this.cols) {
        const btn = this.getButton(row, col);
        if (btn) {
          btn.isActive = true;
          (btn.material as B.StandardMaterial).diffuseColor = new B.Color3(1, 0, 0);
        }
      }
    });
  
    this.sendPatternToPianoRoll();
  }
  

  
  public async getState(): Promise<AudioNodeState> {
    const parameters: WamParameterDataMap = {};

    this.buttons.forEach((row, rowIndex: number): void => {
        row.forEach((note, i: number): void => {
            const paramId = `note${rowIndex}:${i}`;
            parameters[paramId] = {
                id: paramId,
                value: note.isActive ? 1 : 0,
                normalized: false,
            };
        });
    });

    const inputNodes: string[] = [];
    this.inputNodes.forEach((node: AudioNode3D): void => {
        inputNodes.push(node.id);
    });

    return {
        id: this.id,
        name: 'PianoRoll',
        //@ts-ignore
        configFile: 'PianoRoll',
        position: {
            x: this.boundingBox.position.x,
            y: this.boundingBox.position.y,
            z: this.boundingBox.position.z,
        },
        rotation: {
            x: this.boundingBox.rotation.x,
            y: this.boundingBox.rotation.y,
            z: this.boundingBox.rotation.z,
        },
        inputNodes: inputNodes,
        parameters: parameters,
    };
}
public setState(state: AudioNodeState): void {
  super.setState(state);
  console.log("trigger3");

}
}