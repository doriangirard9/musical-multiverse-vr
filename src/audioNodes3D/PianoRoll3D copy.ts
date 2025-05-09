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

export class PianoRollCopy extends Wam3D {
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

  // New properties for row navigation
  private _startRowIndex: number = 0; // Index of the first visible row
  private _visibleRowCount: number = 7; // Number of rows visible at one time
  private _totalRows: number = 14; // Total number of rows (total notes)
  private _btnScrollUp!: B.Mesh;
  private _btnScrollDown!: B.Mesh;
  private _noteLabels: B.Mesh[] = [];

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
    
    // // Add text to the start/stop button
    // const advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(this.btnStartStop, 512, 256);
    // const textBlock = new GUI.TextBlock();
    // textBlock.text = "Start";
    // textBlock.color = "white";
    // textBlock.fontSize = 100;
    // textBlock.outlineWidth = 2;
    // textBlock.outlineColor = "black";
    // textBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    // textBlock.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    // advancedTexture.addControl(textBlock);
    
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
        // textBlock.text = "Stop";

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
          // textBlock.text = "Start";
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
    
    // Create labels for notes first
    this._createNoteLabels();
    
    // Initialize the entire grid structure first
    for (let row = 0; row < this._notes.length; row++) {
      this._grid.push([]);
      for (let col = 0; col < numberOfColumns; col++) {
        // We'll create the buttons, but control visibility later
        this._createNoteButton(row, col);
      }
    }
    
    // Create navigation buttons
    this._createScrollButtons();
    
    // Initially update visibility to show only the visible rows
    this._updateRowVisibility();
  }

  private _createNoteLabels(): void {
    for (let row = 0; row < this._notes.length; row++) {
      // Create a simple box for each note label
      const labelMesh = B.MeshBuilder.CreateBox(
        `noteLabel_${row}`,
        { width: 1.2, height: 0.4, depth: 0.6 },
        this._scene
      );
      
      // Position to the left of the grid
      labelMesh.position.x = -12;
      labelMesh.position.y = 0.25; 
      
      // Use the same position as the buttons initially
      const fixedRowPosition = row - 6.5;
      labelMesh.position.z = fixedRowPosition;
      
      labelMesh.parent = this.baseMesh;
      
      // Set initial visibility
      labelMesh.isVisible = row >= this._startRowIndex && 
                           row < this._startRowIndex + this._visibleRowCount;
      
      // Create material
      const labelMaterial = new B.StandardMaterial(`noteLabelMaterial_${row}`, this._scene);
      labelMaterial.diffuseColor = new B.Color3(0.2, 0.2, 0.4); // Dark blue
      labelMesh.material = labelMaterial;
      
      // Add note name text
      const advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(labelMesh);
      const textBlock = new GUI.TextBlock();
      textBlock.text = this._notes[row];
      textBlock.color = "white";
      textBlock.fontSize = 16;
      textBlock.outlineWidth = 1;
      textBlock.outlineColor = "black";
      textBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
      textBlock.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
      advancedTexture.addControl(textBlock);
      
      // Store reference
      this._noteLabels.push(labelMesh);
    }
  }

  private _createScrollButtons(): void {
    // Create "scroll up" button at the top
    this._btnScrollUp = B.MeshBuilder.CreateBox(
      "btnScrollUp",
      { width: 25, height: 0.5, depth: 0.8 },
      this._scene
    );
    
    const materialUp = new B.StandardMaterial("materialScrollUp", this._scene);
    materialUp.diffuseColor = new B.Color3(0.2, 0.6, 0.8);
    this._btnScrollUp.material = materialUp;
    this._btnScrollUp.parent = this.baseMesh;
    this._btnScrollUp.position.y = 0.3;
    this._btnScrollUp.position.z = -3.8; // Position above the top visible row (centered at -3)
    
    // Create "scroll down" button at the bottom
    this._btnScrollDown = B.MeshBuilder.CreateBox(
      "btnScrollDown",
      { width: 25, height: 0.5, depth: 0.8 },
      this._scene
    );
    
    const materialDown = new B.StandardMaterial("materialScrollDown", this._scene);
    materialDown.diffuseColor = new B.Color3(0.2, 0.6, 0.8);
    this._btnScrollDown.material = materialDown;
    this._btnScrollDown.parent = this.baseMesh;
    this._btnScrollDown.position.y = 0.3;
    this._btnScrollDown.position.z = 3.8; // Position below the bottom visible row (centered at +3)
    
    // Add text to the buttons
    this._addScrollButtonLabel(this._btnScrollUp, "up");
    this._addScrollButtonLabel(this._btnScrollDown, "down");
    
    // Add click actions to the buttons
    if (!this._btnScrollUp.actionManager) {
      this._btnScrollUp.actionManager = new B.ActionManager(this._scene);
    }
    
    if (!this._btnScrollDown.actionManager) {
      this._btnScrollDown.actionManager = new B.ActionManager(this._scene);
    }
    
    // Scroll up action
    this._btnScrollUp.actionManager.registerAction(
      new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
        this._scrollUp();
      })
    );
    
    // Scroll down action
    this._btnScrollDown.actionManager.registerAction(
      new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
        this._scrollDown();
      })
    );
  }

  // New method specifically for scroll button labels
  private _addScrollButtonLabel(mesh: B.Mesh, text: string): void {
    // Create a plane slightly above the button
    const textPlane = B.MeshBuilder.CreatePlane(
      `${mesh.name}_textPlane`,
      { width: 2, height: 0.8 }, 
      this._scene
    );
    
    textPlane.parent = mesh;
    textPlane.position.y = 0.1; // Slightly above the button
    textPlane.rotation.x = Math.PI / 2; // Face upward
    
    // Create a standard material with texture
    const textMaterial = new B.StandardMaterial(`${mesh.name}_textMaterial`, this._scene);
    textMaterial.diffuseColor = new B.Color3(1, 1, 1);
    textMaterial.specularColor = new B.Color3(0, 0, 0);
    textMaterial.emissiveColor = new B.Color3(1, 1, 1);
    textPlane.material = textMaterial;
    
    // Create dynamic texture
    const textTexture = new B.DynamicTexture(`${mesh.name}_texture`, {width: 256, height: 128}, this._scene, true);
    textMaterial.diffuseTexture = textTexture;
    textMaterial.useAlphaFromDiffuseTexture = true;
    
    // Draw text on texture
    const ctx = textTexture.getContext();
    ctx.clearRect(0, 0, 256, 128);
    ctx.font = "bold 80px Arial";
    ctx.fillStyle = "white";
    // ctx.textAlign = "center";
    // ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 64);
    
    // Update texture
    textTexture.update();
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
    if (this._startRowIndex + this._visibleRowCount < this._totalRows) {
      this._startRowIndex++;
      this._updateRowVisibility();
    }
  }

  private _updateRowVisibility(): void {
    // Calculate the end row index
    const endRowIndex = Math.min(
      this._startRowIndex + this._visibleRowCount,
      this._totalRows
    );
    
    // Update visibility for all rows
    for (let row = 0; row < this._totalRows; row++) {
      const isVisible = row >= this._startRowIndex && row < endRowIndex;
      
      // For visible rows, we need to adjust their position to center them
      if (isVisible) {
        // Calculate the visual row index (0-6) for display
        const visualRowIndex = row - this._startRowIndex;
        
        // Position in a centered grid that spans from -3 to +3 on z-axis
        // This places 7 rows evenly distributed and centered on the base mesh
        const centeredPosition = visualRowIndex - 3;
        
        // Update all buttons in this row
        for (let col = 0; col < this._grid[row].length; col++) {
          this._grid[row][col].mesh.position.z = centeredPosition;
          this._grid[row][col].mesh.isVisible = true;
        }
        
        // Update the note label position and visibility
        if (this._noteLabels[row]) {
          this._noteLabels[row].position.z = centeredPosition;
          this._noteLabels[row].isVisible = true;
        }
      } else {
        // Simply hide buttons for non-visible rows
        for (let col = 0; col < this._grid[row].length; col++) {
          this._grid[row][col].mesh.isVisible = false;
        }
        
        // Hide the note label for this row
        if (this._noteLabels[row]) {
          this._noteLabels[row].isVisible = false;
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
    materialDown.diffuseColor = this._startRowIndex + this._visibleRowCount < this._totalRows 
      ? new B.Color3(0.2, 0.6, 0.8) // Active
      : new B.Color3(0.2, 0.2, 0.2); // Inactive
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

    // Calculate position but keep z-offset for rows the same
    // This ensures that we'll just change visibility instead of moving buttons
    buttonMesh.position.x = column - 10.5;
    buttonMesh.position.y = 0.2;
    
    // Position in a fixed grid centered at 0 on the z-axis
    // Since we have 14 total rows, this ranges from -6.5 to +6.5
    // We'll offset it in _updateRowVisibility when showing/hiding rows
    const fixedRowPosition = row - 6.5;
    buttonMesh.position.z = fixedRowPosition;
    buttonMesh.parent = this.baseMesh;
    
    // Set initial visibility
    buttonMesh.isVisible = row >= this._startRowIndex && 
                          row < this._startRowIndex + this._visibleRowCount;

    // Set the initial color - alternating between blue and sky blue based on row
    const buttonMaterial = new B.StandardMaterial(`noteMaterial_${row}_${column}`, this._scene);
    
    // Determine base color based on row parity
    if (row % 2 === 0) {
        buttonMaterial.diffuseColor = new B.Color3(0, 0, 0.8); // Dark blue
    } else {
        buttonMaterial.diffuseColor = new B.Color3(0.3, 0.7, 1); // Sky blue
    }
    
    buttonMesh.material = buttonMaterial;

    // Add note label to the first column buttons
    if (column === 0) {
      this._addNoteLabelToButton(buttonMesh, this._notes[row]);
    }

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

  // Add note labels directly to buttons in the first column
  private _addNoteLabelToButton(buttonMesh: B.Mesh, noteName: string): void {
    // Create a plane on top of the button
    const textPlane = B.MeshBuilder.CreatePlane(
      `${buttonMesh.name}_textPlane`,
      { width: 0.5, height: 0.5 },
      this._scene
    );
    
    textPlane.parent = buttonMesh;
    textPlane.position.y = 0.101; // Just above the button
    textPlane.rotation.x = Math.PI / 2; // Face upward
    textPlane.isPickable = false; // Don't interfere with button clicks
    
    // Create material with texture for the text
    const textMaterial = new B.StandardMaterial(`${buttonMesh.name}_textMaterial`, this._scene);
    textMaterial.specularColor = new B.Color3(0, 0, 0); // No specular
    textMaterial.emissiveColor = new B.Color3(1, 1, 1); // Make it bright
    textPlane.material = textMaterial;
    
    // Create a dynamic texture to render the text
    const textTexture = new B.DynamicTexture(`${buttonMesh.name}_texture`, 
      {width: 128, height: 128}, this._scene, true);
    textMaterial.diffuseTexture = textTexture;
    textMaterial.useAlphaFromDiffuseTexture = true;
    
    // Draw the note name on the texture
    const ctx = textTexture.getContext();
    ctx.clearRect(0, 0, 128, 128);
    ctx.font = "bold 48px Arial";
    //@ts-ignore
    ctx.textAlign = "center";
    //@ts-ignore
    ctx.textBaseline = "middle";
    ctx.fillStyle = "white";
    ctx.fillText(noteName, 64, 64);
    
    // Update the texture
    textTexture.update();
  }

  private _toggleNoteState(row: number, column: number): void {
    // Skip if the row is not visible
    if (row < this._startRowIndex || row >= this._startRowIndex + this._visibleRowCount) {
      return;
    }
    
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
    
    if (button.isActivated) {
      material.diffuseColor = new B.Color3(1, 0, 0); // Red if active
    } else {
      // Return to the original alternating colors
      if (row % 2 === 0) {
        material.diffuseColor = new B.Color3(0, 0, 0.8); // Dark blue
      } else {
        material.diffuseColor = new B.Color3(0.3, 0.7, 1); // Sky blue
      }
    }
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
  
  private _onPlayButtonAnimation(noteNumber: number, tick: number, scheduledTime: number): void {
    const row = this._notes.findIndex(n => this._convertNoteToMidi(n) === noteNumber);
    const column = tick / 4;
    
    // Skip if the row is not visible or if the coordinates are invalid
    if (row === -1 || 
        column < 0 || 
        column >= this._grid[0].length ||
        row < this._startRowIndex || 
        row >= this._startRowIndex + this._visibleRowCount) {
      return;
    }
    
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