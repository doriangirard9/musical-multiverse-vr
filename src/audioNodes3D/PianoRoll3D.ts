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

export class PianoRoll extends Wam3D {
  private _notes: string[] = ["C3", "D3", "E3", "F3", "G3", "A3", "B3", "C4", "D4", "E4", "F4", "G4", "A4", "B4"];
  private _grid: { mesh: B.Mesh; isActivated: boolean }[][] = [];
  private _pattern = {
    length: 64,
    notes: [] as {
      tick: number;
      number: number;
      duration: number;
      velocity: number;
    }[],
  };

  private _tempo: number = 120; // Default tempo
  private _tickDuration: number = 0; // To be calculated dynamically

  private _activeNotes: { row: number; column: number; offTime: number }[] = [];

  private btnStartStop: B.Mesh;
  private isBtnStartStop: boolean = true;
  startTime: number = 0;
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
      // let e= this._wamInstance.audioNode.getState()
      // console.log("state", e)
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

      this._configSequencerLoop(); // Ensures visual sync
      this._startVisualUpdateLoop()
      this.timer();
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
    const numberOfColumns = this._pattern.length / 4; // example 16 columns for 64 ticks
    for (let row = 0; row < this._notes.length; row++) {
      this._grid.push([]);
      for (let col = 0; col < numberOfColumns; col++) {
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
    const tick = column * 4;

    // Find if note already exists in the pattern
    const existingIndex = this._pattern.notes.findIndex(
      (n) => n.number === noteValue && n.tick === tick
    );

    if (existingIndex === -1) {
      // Add note
      this._pattern.notes.push({
        tick,
        number: noteValue,
        duration: 4, // 1/16 note duration
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
      C3: 48,
      D3: 50,
      E3: 52,
      F3: 53,
      G3: 55,
      A3: 57,
      B3: 59,
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

  private timer(): void {
    // temps écoulé depuis start

    this._scene.onBeforeRenderObservable.add(() => {
// setInterval(()=>{
  const elapsed = this._audioCtx.currentTime - this.startTime;
  // En fonction du tempo, calculer la position de la tête de lecture
  const tempo = 120;
  // durée de 1 temps = 60 secondes / tempo
  const tickDuration = 60 / tempo;
  // nombre de temps écoulés
  const currentTick = Math.floor(elapsed / tickDuration*4);
  // affichage du temps courant
    console.log(currentTick %16) ;

// },10)

});

    // display the current tick on timer balise
    

  }

  private _configSequencerLoop(): void {
    const lookahead = 25.0; // milliseconds
    const scheduleAheadTime = 0.3; // seconds
    let currentTick = 0;
    let nextNoteTime = this._audioCtx.currentTime;
  
    const scheduler = () => {
      while (nextNoteTime < this._audioCtx.currentTime + scheduleAheadTime) {
        this._scheduleTick(currentTick, nextNoteTime);
        nextNoteTime += this._tickDuration;
        currentTick = (currentTick + 4) % this._pattern.length; // 4 ticks per step for 1/16 note
      }
    };
  
    setInterval(scheduler, lookahead);
  }

  private _scheduleTick(tick: number, time: number): void {
    this._pattern.notes.forEach(note => {
      if (note.tick === tick) {
        this._onPlayButtonAnimation(note.number, tick, time);
      }
    });
  }
  

  private _startVisualUpdateLoop(): void {
    const update = () => {
      const currentTime = this._audioCtx.currentTime;
      // Update active notes based on their offTime.
      this._activeNotes = this._activeNotes.filter(noteInfo => {
        if (currentTime >= noteInfo.offTime) {
          this._updateNoteColor(noteInfo.row, noteInfo.column);
          return false;
        }
        return true;
      });
      requestAnimationFrame(update);
    };
    update();
  }
  
  // In _onPlayButtonAnimation, add the note to _activeNotes:
  private _onPlayButtonAnimation(noteNumber: number, tick: number, scheduledTime: number): void {
    const row = this._notes.findIndex(n => this._convertNoteToMidi(n) === noteNumber);
    const column = tick / 4;
    if (row === -1 || column < 0 || column >= this._grid[0].length) return;
    
    const button = this._grid[row][column];
    const material = button.mesh.material as B.StandardMaterial;
    
    
    // Use a visual offset here as well if needed.
    const visualOffset = 0.3;
    let delay = ((scheduledTime - visualOffset) - this._audioCtx.currentTime) * 1000;
    // if (delay < 0) delay = 0;
    setTimeout(() => {
      material.diffuseColor = new B.Color3(0, 1, 0); // Green when playing
      // Store the note's offTime for continuous update.
      this._activeNotes.push({
        row,
        column,
        offTime: scheduledTime + this._tickDuration - visualOffset
      });
    }, delay);



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