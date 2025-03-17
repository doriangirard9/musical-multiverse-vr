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

export class PianoRoll extends Wam3D {
  private _notes: string[] = ["C4", "D4", "E4", "F4", "G4", "A4", "B4"];
  private _grid: { mesh: B.Mesh; isActivated: boolean }[][] = [];
  private _pattern = {
    length: 256,
    notes: [] as {
      tick: number;
      number: number;
      duration: number;
      velocity: number;
    }[],
  };

  private _tempo: number = 120; // Default tempo
  private _tickDuration: number = 0; // To be calculated dynamically


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
    this.btnStartStop = B.MeshBuilder.CreateBox("startStopButton", { width: 2, height:1, depth: 0.6 }, this._scene);
  }

  public async instantiate(): Promise<void> {
    try {
      if (!this._scene || !this._audioCtx) {
        throw new Error("Scene or AudioContext is not initialized.");
      }

      this._wamInstance = await this._initWamInstance(this._config.url);
      this._createBaseMesh();
      this._createGrid();
      this._initActionManager();
      const baseY = this.baseMesh.position.y;
      const baseZ = this.baseMesh.position.z;

      // this.basemesh length and width
      const baseLength = this.baseMesh.getBoundingInfo().boundingBox.extendSize.x;
      this._createOutputMidi(new B.Vector3(baseLength, baseY, baseZ+1));
      

      // this._createOutputMidi(new B.Vector3(15, baseY, baseZ + 1));
    console.log("x position", this.baseMesh.position.x)
    //   this._createOutputMidi(new B.Vector3(this.baseMesh.position.x + 4.2, this.baseMesh.position.y, this.baseMesh.position.z+1));
      // Get tempo and calculate tick duration
      this._tempo = 120; // Change this dynamically if needed
      this._tickDuration = (60 / this._tempo) / 4; // Quarter note duration in seconds

      this._wamInstance.audioNode.scheduleEvents({
        type: "wam-transport",
        data: {
          playing: true,
          timeSigDenominator: 4,
          timeSigNumerator: 4,
          currentBar: 0,
          currentBarStarted: this._audioCtx.currentTime,
          tempo: this._tempo,
        },
      });

      // this._configSequencerLoop(); // Ensures visual sync

      const bo = new BoundingBox(this, this._scene, this.id, this._app);
      this.boundingBox = bo.boundingBox;
      this.startStopButton();
    } catch (error) {
      console.error("Error instantiating PianoRoll:", error);
    }
  }
  // add function start stop button mesh
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
    // write on the face of the button start
    // const advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(this.btnStartStop);
    // const text1 = new GUI.TextBlock();
    // toggle start stop
    this.btnStartStop.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {

      // check if color is green

      if (this.isBtnStartStop) {
        this._wamInstance.audioNode.scheduleEvents({
          type: "wam-transport",
          data: {
            playing: false,
            timeSigDenominator: 4,
            timeSigNumerator: 4,
            currentBar: 0,
            currentBarStarted: this._audioCtx.currentTime,
            tempo: this._tempo,
          },
        });
        this.isBtnStartStop = false;
        material.diffuseColor = B.Color3.Red();

        // text1.text = "Start";
        // advancedTexture.addControl(text1);

        } else {
          this._wamInstance.audioNode.scheduleEvents({
            type: "wam-transport",
            data: {
              playing: true,
              timeSigDenominator: 4,
              timeSigNumerator: 4,
              currentBar: 0,
              currentBarStarted: this._audioCtx.currentTime,
              tempo: this._tempo,
            },
          });
          this.isBtnStartStop = true;
          material.diffuseColor = B.Color3.Green();
          // write on the face of the button stop

          }
    }));

  }

  protected _createBaseMesh(): void {
    this.baseMesh = B.MeshBuilder.CreateBox(
      "base",
      { width: 25, height: 0.2, depth: 10 },
      this._scene
    );
    const material = new B.StandardMaterial("material", this._scene);
    material.diffuseColor = new B.Color3(0.1, 0.1, 0.1);
    this.baseMesh.material = material;
  }

  private _createGrid(): void {
    for (let row = 0; row < this._notes.length; row++) {
      this._grid.push([]);
      for (let col = 0; col < 22; col++) {
        this._createNoteButton(row, col);
      }
    }
  }

  public connect(destination: AudioNode): void {
    // @ts-ignore
    this._wamInstance.audioNode.connectEvents(destination.instanceId);
  }

  private _createNoteButton(row: number, column: number): void {
    const buttonMesh = B.MeshBuilder.CreateBox(
      `note_${row}_${column}`,
      { width: 0.6, height: 0.2, depth: 0.6 },
      this._scene
    );

    buttonMesh.position.x = column - 10.5;
    buttonMesh.position.y = 0.2;
    buttonMesh.position.z = row - 3.5;
    buttonMesh.parent = this.baseMesh;

    // Set the initial color
    const buttonMaterial = new B.StandardMaterial("noteMaterial", this._scene);
    buttonMaterial.diffuseColor = new B.Color3(0, 0, 1);
    buttonMesh.material = buttonMaterial;

    this._grid[row].push({ mesh: buttonMesh, isActivated: false });

    // Attach an action to handle note activation
    if (!buttonMesh.actionManager) {
      buttonMesh.actionManager = new B.ActionManager(this._scene);
    }

    buttonMesh.actionManager.registerAction(
      new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
        this._toggleNoteState(row, column);
      })
    );
  }

  private _toggleNoteState(row: number, column: number): void {
    const noteValue = this._convertNoteToMidi(this._notes[row]);
    const tick = column * 12;

    // Find if note already exists in the pattern
    const existingIndex = this._pattern.notes.findIndex(
      (n) => n.number === noteValue && n.tick === tick
    );

    if (existingIndex === -1) {
      // Add note
      this._pattern.notes.push({
        tick,
        number: noteValue,
        duration: 8,
        velocity: 100,
      });
      this._grid[row][column].isActivated = true;
      
    } else {
      // Remove note
      this._pattern.notes.splice(existingIndex, 1);
      this._grid[row][column].isActivated = false;
    }

    // Update button color
    this._updateNoteColor(row, column);

    // Send updated pattern to the piano roll instance
    this._sendPatternToPianoRoll();
  }

  private _convertNoteToMidi(note: string): number {
    const noteMap: { [key: string]: number } = {
      C4: 60,
      D4: 62,
      E4: 64,
      F4: 65,
      G4: 67,
      A4: 69,
      B4: 71,
    };
    return noteMap[note]// || 60;
  }

  private _updateNoteColor(row: number, column: number): void {
    const button = this._grid[row][column];
    const material = button.mesh.material as B.StandardMaterial;
    material.diffuseColor = button.isActivated
      ? new B.Color3(1, 0, 0) // Red if active
      : new B.Color3(0, 0, 1); // Blue if inactive
  }

  private _configSequencerLoop(): void {
    let currentTick = 0;
    setInterval(() => {
      this._pattern.notes.forEach(note => {
        if (note.tick === currentTick) {
          this._onPlayButtonAnimation(note.number, note.tick);
        }
      });

      currentTick = (currentTick + 12) % 256; // Move to next step
    }, this._tickDuration * 1000); // Syncs with tick duration
  }

  private _onPlayButtonAnimation(noteNumber: number, tick: number): void {
    const row = this._notes.findIndex(n => this._convertNoteToMidi(n) === noteNumber);
    const column = tick / 12;
    if (row === -1 || column < 0 || column >= 22) return;

    const button = this._grid[row][column];
    const material = button.mesh.material as B.StandardMaterial;
    material.diffuseColor = new B.Color3(0, 1, 0); // Green when playing

    setTimeout(() => {
      this._updateNoteColor(row, column);
    }, this._tickDuration * 1000);
  }
  private _sendPatternToPianoRoll(): void {
    if (!(window.WAMExtensions && window.WAMExtensions.patterns)) {
      console.warn("Piano roll delegate not found.");
      return;
    }

    const delegatePianoRoll = window.WAMExtensions.patterns.getPatternViewDelegate(
      this._wamInstance.audioNode.instanceId
    );
    console.log("pattern sended")
    const testPattern = {
      "length": 96,
      "notes": [
         {
          "tick": 0,
          "number": 57,
          "duration": 6,
          "velocity": 100
        },
        {
            "tick": 12,
            "number": 58,
            "duration": 6,
            "velocity": 100
        },
        {
            "tick": 30,
            "number": 62,
            "duration": 6,
            "velocity": 100
        },
        {
            "tick": 36,
            "number": 58,
            "duration": 12,
            "velocity": 100
        },
        {
            "tick": 36,
            "number": 60,
            "duration": 6,
            "velocity": 100
        },
        {
            "tick": 48,
            "number": 56,
            "duration": 6,
            "velocity": 100
        },
        {
            "tick": 60,
            "number": 61,
            "duration": 18,
            "velocity": 100
        },
        {
            "tick": 72,
            "number": 54,
            "duration": 6,
            "velocity": 100
        }
    ]
  }
    delegatePianoRoll!.setPatternState("default", this._pattern);
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
}
