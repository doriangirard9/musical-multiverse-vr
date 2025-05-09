import * as B from "@babylonjs/core";
import { AudioNode3D } from "./AudioNode3D.ts";
import { AudioNodeState } from "../network/types.ts";
import { BoundingBox } from "./BoundingBox.ts";
import { ControllerBehaviorManager } from "../xr/BehaviorControllerManager.ts";
import { WamParameterDataMap } from "@webaudiomodules/api";
import { Wam3D } from "./Wam3D.ts";
import { CustomParameter, IAudioNodeConfig, IWamConfig } from "./types.ts";
import { ParamBuilder } from "./parameters/ParamBuilder.ts";
import { Instrument3D } from "./Instrument3D.ts";
import * as GUI from "@babylonjs/gui";
import { log } from "tone/build/esm/core/util/Debug";
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
  private startX: number;
  private endX: number;
  private startZ: number;
  private endZ: number;
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
  private currentControlSequence: ControlSequence | null = null;
  private pattern: Pattern;
  private isAKeyPressed = false;
  private ticksPerColumn = 6;

    private btnStartStop: B.Mesh;
    private isBtnStartStop: boolean = true;
  constructor(
    scene: B.Scene,
    audioCtx: AudioContext,
    id: string,
    config: IWamConfig,
    s: IAudioNodeConfig
  ) {
    super(scene, audioCtx, id, config, s);
    this.rows =7;
    this.cols = 16;
    this.tempo = 60;
    
    this.startX = -(this.cols - 1) / 2 * (this.buttonWidth + this.buttonSpacing);
    this.endX = (this.cols - 1) / 2 * (this.buttonWidth + this.buttonSpacing);
    this.startZ = -(this.rows - 1) / 2 * (this.buttonDepth + this.buttonSpacing);
    this.endZ = (this.rows - 1) / 2 * (this.buttonDepth + this.buttonSpacing);
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
  
  this.btnStartStop = B.MeshBuilder.CreateBox("startStopButton", { width: 2, height:1, depth: 0.6 }, this._scene);
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

      } catch (error) {
        console.error("Error instantiating PianoRoll:", error);
      }
    }
    public startStopButton(): void {
      this.btnStartStop.parent = this.baseMesh;
      const material = new B.StandardMaterial("material", this._scene);
      material.diffuseColor =  B.Color3.Green();
      this.btnStartStop.material = material;
      this.btnStartStop.position.x = -10.5;
      this.btnStartStop.position.y = 1;
      this.btnStartStop.position.z = 3.5;
  
      // add click action to start stop button
      this.btnStartStop.actionManager = new B.ActionManager(this._scene);
      

      // toggle start stop
      this.btnStartStop.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
  
        // check if color is green
        if (this.isBtnStartStop) {
          this.stop()
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
          this.isBtnStartStop = false;
          material.diffuseColor = B.Color3.Red();
          // textBlock.text = "Stop";
  
          } else {
            this.start()
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
            this.isBtnStartStop = true;
            material.diffuseColor = B.Color3.Green();
            // textBlock.text = "Start";
          }
      }));
    }

    protected _createBaseMesh(): void {
        this.baseMesh = B.MeshBuilder.CreateBox('box', {          
          width: this.endX - this.startX + this.buttonWidth * 2 + this.buttonSpacing,
          height: 0.2,
          depth: this.endZ - this.startZ + this.buttonDepth+ this.buttonSpacing
         }, this._scene);

        const material = new B.StandardMaterial('material', this._scene);
        material.diffuseColor = new B.Color3(0.5, 0.2, 0.2);
        this.baseMesh.material = material;
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
  this.buttonMaterial = new B.StandardMaterial("buttonMaterial", this._scene);
  this.buttonMaterial.diffuseColor = new B.Color3(0.2, 0.6, 0.8);
  this.buttons = Array.from({ length: this.rows }, () => []);

  for (let i = 0; i < this.rows; i++) {
      const isBlack = this.isBlackKeyFromNoteName(this.notes[i]);

      const colorBox = B.MeshBuilder.CreateBox(`color_box_${i}`, {
          width: this.buttonWidth,
          height: this.buttonHeight,
          depth: this.buttonDepth
      }, this._scene);

      colorBox.parent  = this.baseMesh;
      colorBox.position.x = this.startX - 2 * (this.buttonWidth + this.buttonSpacing);
      colorBox.position.z = (i - (this.rows - 1) / 2) * (this.buttonDepth + this.buttonSpacing);
      colorBox.position.y = this.buttonHeight / 2;

      const colorMaterial = new B.StandardMaterial(`colorBoxMaterial_${i}`, this._scene);
      colorMaterial.diffuseColor = isBlack ? new B.Color3(0.1, 0.1, 0.1) : new B.Color3(1, 1, 1);
      colorBox.material = colorMaterial;

      for (let j = 0; j < this.cols; j++) {
          const button = B.MeshBuilder.CreateBox(`button${i}_${j}`, {
              width: this.buttonWidth,
              height: this.buttonHeight,
              depth: this.buttonDepth
          }, this._scene) as NoteButtonMesh;  // <<==== Type assertion here

          button.position.x = (j - (this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);
          button.position.z = colorBox.position.z;
          button.position.y = this.buttonHeight / 2;

          button.isActive = false;      // <<==== Property now exists
          button.isPlaying = false;     // <<==== Property now exists
          button.parent = this.baseMesh;

          const material = new B.StandardMaterial(`buttonMaterial_${i}_${j}`, this._scene);
          material.diffuseColor = new B.Color3(0.2, 0.6, 0.8);
          button.material = material;

          this.buttons[i].push(button);
      }
  }
}


createPlayhead(): void {
  this.playhead = B.MeshBuilder.CreateBox("playhead", {
      width: 0.1,
      height: 0.2,
      depth: this.endZ - this.startZ + this.buttonDepth
  }, this._scene);

  const playheadMaterial = new B.StandardMaterial("playheadMaterial", this._scene);
  playheadMaterial.diffuseColor = new B.Color3(0, 1, 0);
  this.playhead.material = playheadMaterial;
  this.playhead.position.x = this.getStartX();
  this.playhead.position.y = 0.2;
  this.playhead.parent = this.baseMesh;
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
}

stop(): void {
  this.started = false;
  this.playhead.position.x = this.getStartX();
}

setTempo(bpm: number): void {
  this.tempo = bpm;
  this.beatDuration = 60 / this.tempo;
  this.cellDuration = this.beatDuration / this.timeSignatureDenominator;
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

  this.buttons.forEach((row, rowIndex: number): void => {
      row.forEach((note, i: number): void => {
          const paramId = `note${rowIndex}:${i}`;
          const paramData = state.parameters[paramId];

          if (paramData) {
              note.isActive = paramData.value === 1;
          } else {
              console.warn(`Parameter ${paramId} is missing in state.parameters.`);
              // You can decide to default to false or handle it differently
              note.isActive = false;
          }

          this.toggleNoteColor(rowIndex, i);
      });
  });
}
}