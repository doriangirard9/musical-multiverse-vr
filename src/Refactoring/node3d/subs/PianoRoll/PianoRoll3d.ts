import { Color3, Color4, type AbstractMesh } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { MidiN3DConnectable } from "../../tools";
import { Node3DContext } from "../../Node3DContext";
import * as B from "@babylonjs/core";
import { WebAudioModule } from "@webaudiomodules/api";
import { WamInitializer } from "../../../app/WamInitializer";
import { PianoRollSettingsMenu } from "./PianoRollSettingsMenu";
import { XRManager } from "../../../xr/XRManager";
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
    mode?: "normal" | "control" | "none";
  }
  interface ControlSequence {
    row: number;
    startCol: number;
    startTick: number;
    midiNumber: number;
    borderMesh: B.Mesh;
}


// colors 
  // Color Constants
  const COLOR_ACTIVE = new B.Color3(1, 0, 0);         // Red
  const COLOR_INACTIVE = new B.Color3(0.2, 0.6, 0.8); // Blue
  const COLOR_PLAYING = new B.Color3(0, 1, 0);        // Green
  const COLOR_LONG_PLAYING = new B.Color3(0.6588, 0.2, 0.8); // Purple
  const COLOR_BLACK_KEY = new B.Color3(0.1, 0.1, 0.1);
  const COLOR_WHITE_KEY = new B.Color3(1, 1, 1);
  const COLOR_DISABLED = new B.Color3(0.2, 0.2, 0.2);
  const COLOR_BASE_MESH = new B.Color3(0.5, 0.2, 0.2);
  const COLOR_MENU_BUTTON = new B.Color3(0, 0, 0);



class PianoRollN3DGUI implements Node3DGUI {
    root
    public tool
    block!: B.AbstractMesh;
    playhead!: B.Mesh
    menuButton!: B.Mesh
    scrollUpButton!: B.Mesh
    scrollDownButton!: B.Mesh
    midiOutput!: B.Mesh;

    // Grid properties
    rows: number= 88;
    cols: number= 16;

    // grid edges
    startX!: number;
    endX!: number;
    startZ!: number;
    endZ!: number;

    buttonWidth = 2;
    buttonHeight = 0.2;
    buttonDepth = 0.5;
    buttonSpacing = 0.2;

    // Scrolling properties
    visibleRowCount: number = 7;
    private _startRowIndex: number = 0;
    
    // grid buttons(buttons: blue keys,colorBoxes: black and white keys)
    buttons: NoteButtonMesh[][] = [];
    keyBoard: B.Mesh[] = [];

  // scrolling 
  private _btnScrollUp!: B.Mesh;
  private _btnScrollDown!: B.Mesh;
    
  //menu
  // private menu!  : PianoRollSettingsMenu;

    public btnStartStop!: B.Mesh;


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
        const {babylon:B,tools:T} = context
        this.tool= T;
        this.root = new B.TransformNode("pianoroll root", context.scene)
        this.root.scaling.setAll(0.1);

        // Adjust visible row count if necessary
        if (this.rows < this.visibleRowCount) {
            this.visibleRowCount = this.rows;
        }
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

          this.midiOutput = B.CreateIcoSphere("piano roll midi output", { radius: this.buttonWidth * 2 }, this.context.scene);

          this.tool.MeshUtils.setColor(this.midiOutput, MidiN3DConnectable.OutputColor.toColor4())
          this.midiOutput.position.set(baseLength, baseY, baseZ+1)
          this.midiOutput.scaling.setAll(0.5);
          this.midiOutput.parent = this.root;

          this.startStopButton();
          // this.menu = new PianoRollSettingsMenu(this.context.scene, this);

      }

createGrid(): void {
  this.buttons = Array.from({ length: this.rows }, () => []);
  this.keyBoard = Array.from({ length: this.rows }, () => undefined as unknown as B.Mesh);

  for (let row = 0; row < this.rows; row++) {
    const isBlackKey = this.isBlackKeyFromNoteName(this.notes[row]);
    const colorBox = this._createColorBox(row, isBlackKey);
    colorBox.parent = this.root; // Set parent to root for proper hierarchy
    this.keyBoard[row] = colorBox;

    for (let col = 0; col < this.cols; col++) {
      const button = this._createNoteButton(row, col, 1)//colorBox.position.z);
      this.buttons[row].push(button);
    }
  }
}

isBlackKeyFromNoteName(note: string): boolean {
  return note.includes("#") || note.includes("b");
}

private _createColorBox(row: number, isBlack: boolean): B.Mesh {
    const positionZ = (row - (this.rows - 1) / 2) * (this.buttonDepth + this.buttonSpacing);
    const position = new B.Vector3(
      this.startX - (this.buttonWidth + this.buttonSpacing),
      this.buttonHeight / 2,
      positionZ
    );
  
    const color = isBlack ? COLOR_BLACK_KEY : COLOR_WHITE_KEY;
  
    return this._createBox(
      `color_box_${row}`,
      { width: this.buttonWidth, height: this.buttonHeight, depth: this.buttonDepth },
      color,
      position,
      this.root
    );
  }

  
  
private _createNoteButton(row: number, col: number, z: number): NoteButtonMesh {
    const positionX = (col - (this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);
    const position = new B.Vector3(positionX, this.buttonHeight / 2, z);
  
    const button = this._createBox(
      `button${row}_${col}`,
      { width: this.buttonWidth, height: this.buttonHeight, depth: this.buttonDepth },
      COLOR_INACTIVE,
      position,
      this.root
    ) as NoteButtonMesh;
  
    button.isActive = false;
    button.isPlaying = false;
  
    return button;
  }
  

  private _createBox(
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
  
    if (parent) {
      box.parent = parent;
    }
  
    return box;
  }

    private _createBaseMesh()    {

this.block = this._createBox(
        "pianoRollBlock",  {
            width: (this.endX - this.startX ) + (this.buttonWidth * 2 + this.buttonSpacing) + (this.buttonWidth + this.buttonSpacing*2) , 
            height: 0.2,
            depth: this.endZ - this.startZ + this.buttonDepth+ this.buttonSpacing + (this.buttonDepth+this.buttonSpacing) * 2 // for scrolling buttons
        }, COLOR_BASE_MESH
        , new B.Vector3(0,0,0),this.root)

        // this.block.scaling.setAll(1);
    //     this.block = B.MeshBuilder.CreateBox('pianoRoll block', {          
    //     //width: (diff between buttons) + (adjust for button)+ (keyboard size)
    //     width: (this.endX - this.startX ) + (this.buttonWidth * 2 + this.buttonSpacing) + (this.buttonWidth + this.buttonSpacing*2) , 
    //     height: 0.2,
    //     depth: this.endZ - this.startZ + this.buttonDepth+ this.buttonSpacing + (this.buttonDepth+this.buttonSpacing) * 2 // for scrolling buttons
    //    }, this.context.scene);

    //   const material = new B.StandardMaterial('material', this.context.scene);
    //   material.diffuseColor = COLOR_BASE_MESH;
    //   this.block.material = material;
    //   this.block.parent = this.root

        
  }



  createPlayhead(): void {
    this.playhead = this._createBox(
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
    this._btnScrollUp = this._createBox(
      "btnScrollUp",
      size,
      scrollColor,
      new B.Vector3(0, 0.2, 0), // Temporary z, will be adjusted next
      this.root
    );
  
    const scrollUpZ = this.startZ - this.buttonSpacing - this._btnScrollUp.getBoundingInfo().boundingBox.extendSize.z * 2;
    this._btnScrollUp.position.z = scrollUpZ;
  
    // Create scroll down button
    this._btnScrollDown = this._createBox(
      "btnScrollDown",
      size,
      scrollColor,
      new B.Vector3(0, 0.2, 0), // Temporary z, will be adjusted next
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
    // Scroll up if we're not already at the top
    if (this._startRowIndex > 0) {
      this._startRowIndex--;
      this.updateRowVisibility();
    }
  }
  private _scrollDown(): void {
    // Scroll down if we're not already at the bottom
    if (this._startRowIndex + this.visibleRowCount < this.rows) {
      this._startRowIndex++;
      this.updateRowVisibility();
    }
  }
  updateRowVisibility(): void {
    // end row (exclusive)
    const endRowIndex = Math.min(this._startRowIndex + this.visibleRowCount, this.rows);

    // helper for centring rows in the visible window
    const visibleRangeCenter = (this.visibleRowCount - 1) / 2;

    // a link back to PianoRollN3D so we can reach rowControlBorders
    const owner = (this as any).owner as { rowControlBorders?: { [row: number]: B.Mesh[] } };

    for (let row = 0; row < this.rows; row++) {
        const isVisible = row >= this._startRowIndex && row < endRowIndex;

        //Keyboard colour box
        const colorBox = this.keyBoard[row];
        if (colorBox) {
            if (isVisible) {
                const visualRowIndex = row - this._startRowIndex;
                const centeredPosition = (visualRowIndex - visibleRangeCenter) *
                                          (this.buttonDepth + this.buttonSpacing);
                colorBox.position.z = centeredPosition;
                colorBox.isVisible  = true;
            } else {
                colorBox.isVisible = false;
            }
        }

        //Main grid buttons
        for (let col = 0; col < this.buttons[row].length; col++) {
            const btn = this.buttons[row][col];
            if (isVisible) {
                const visualRowIndex = row - this._startRowIndex;
                const centeredPosition = (visualRowIndex - visibleRangeCenter) *
                                          (this.buttonDepth + this.buttonSpacing);
                btn.position.z = centeredPosition;
                btn.isVisible  = true;
            } else {
                btn.isVisible = false;
            }
        }

        // Long-note borders (yellow bars) 
        if (owner?.rowControlBorders?.[row]) {
            const visualRowIndex = row - this._startRowIndex;
            const centeredPosition = (visualRowIndex - visibleRangeCenter) *
                                      (this.buttonDepth + this.buttonSpacing);

            owner.rowControlBorders[row].forEach(bar => {
                bar.position.z = centeredPosition;  // follow the keys
                bar.isVisible  = isVisible;         // hide / show
            });
        }
    }

    //  Scroll-button enable / disable 
    const matUp   = this._btnScrollUp.material   as B.StandardMaterial;
    const matDown = this._btnScrollDown.material as B.StandardMaterial;

    matUp.diffuseColor   = this._startRowIndex > 0                                   ? COLOR_INACTIVE : COLOR_DISABLED;
    matDown.diffuseColor = this._startRowIndex + this.visibleRowCount < this.rows    ? COLOR_INACTIVE : COLOR_DISABLED;
}


recalculateGridBoundaries(): void {
    // Horizontal (X axis)
    this.startX = -((this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);
    this.endX = ((this.cols - 1) / 2) * (this.buttonWidth + this.buttonSpacing);
  
    // Vertical (Z axis) for rows
    this.startZ = -((this.visibleRowCount - 1) / 2) * (this.buttonDepth + this.buttonSpacing);
    this.endZ = ((this.visibleRowCount - 1) / 2) * (this.buttonDepth + this.buttonSpacing);
  }
  
  public startStopButton(): void {
    this.btnStartStop = this._createBox(
      "startStopButton",
      { width: 2, height: 0.6, depth: 0.4 },
      B.Color3.Green(),
      new B.Vector3(this.startX - (this.buttonWidth + this.buttonSpacing), 0.2, this.endZ + (this.buttonDepth + this.buttonSpacing)),
      this.root
    ); 
  }

      // create box that can be clicked to show a menu
  public createMenuButton(): void {
        this.menuButton = this._createBox(
          "menuButton",
          { width: 2, height: 0.6, depth: 0.4 },
          B.Color3.Black(),
          new B.Vector3(0, 0.6, 0),
          this.root
        );
        // position the button in the corner top right of the grid
        this.menuButton.position.x = this.endX + (this.buttonWidth + this.buttonSpacing);
        this.menuButton.position.z = -this.endZ - (this.buttonDepth + this.buttonSpacing);
  
        // // add click action to start stop button
        // this.menuButton.actionManager = new B.ActionManager(this.context.scene);
        // this.menuButton.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
        //   this.menu.show();
        // }));
  }
 
  getButton(row: number, col: number): NoteButtonMesh | null {
    if (this.buttons[row] && this.buttons[row][col]) {
        return this.buttons[row][col] as NoteButtonMesh;
    }
    return null;
  }
    async dispose(): Promise<void> {
        // this.root.dispose()


    }

    get worldSize() { return 4 }

}


export class PianoRollN3D implements Node3D{

      private wamInstance!: WebAudioModule;
      private pattern: Pattern;
      private tempo: number = 120;
      private started: boolean = false;
      private startTime: number = 0;
      private ticksPerColumn: number = 6;
      private beatDuration: number;
      private cellDuration: number;
      private timeSignatureNumerator = 4;
      private timeSignatureDenominator = 4;
      private context;
      private isBtnStartStop: boolean = true;
      private menu! : PianoRollSettingsMenu;
      private currentControlSequence: ControlSequence | null = null;
      private isAKeyPressed = false;                         // ②

    constructor(context: Node3DContext, private gui: PianoRollN3DGUI){
        const {tools:T} = context
        this.context = context;
        this.beatDuration = 60 / this.tempo;
        this.cellDuration = this.beatDuration / this.timeSignatureDenominator;
        this.pattern = {
            length: this.gui.cols * this.ticksPerColumn,
            notes: []
        };

        
        (this.gui as any).owner = this;

        context.addToBoundingBox(gui.block)

        // Create midi output
        
        const midi_output = new T.MidiN3DConnectable.ListOutput("midioutput", [gui.midiOutput], "MIDI Output")
        context.createConnectable(midi_output)
        
        this.wamInitializer();
        
        const scene = gui.context.scene;
        if (scene && scene.onBeforeRenderObservable) {
          scene.onBeforeRenderObservable.add(() => this.update());
        }
        this.initActions()
        this.toggleStartStopBtn();
        // this.start()
        // Create note buttons

         this.menu = new PianoRollSettingsMenu(gui.context.scene, this);

        // ③  place anywhere after this.context = context; for clarity
        window.addEventListener("keydown", (e) => {
          if (e.key.toLowerCase() === "a") this.isAKeyPressed = true;
        });
        window.addEventListener("keyup", (e) => {
          if (e.key.toLowerCase() === "a") {
            this.isAKeyPressed = false;
            this.currentControlSequence = null;     // reset
          }
        });

    }
    private getButton(row: number, col: number) {
      return this.gui.getButton(row, col);
    }
    

      private async wamInitializer(){
      
        
         this.wamInstance = await WamInitializer.getInstance().initWamInstance("https://www.webaudiomodules.com/community/plugins/burns-audio/pianoroll/index.js");
    
        //  const wamURISynth = 'https://wam-4tt.pages.dev/Pro54/index.js';
        //  const synth= await WamInitializer.getInstance().initWamInstance(wamURISynth)
    
        //  this.wamInstance.audioNode.connectEvents(synth.instanceId);
        //  const builder = new Node3DBuilder();
        // const audioOutput=  builder.create('audiooutput') //as Promise<Node3DInstance>;
    
        //   synth.audioNode.connect(this.context.audioCtx.destination);
         
        //  console.log("wam instance",this.wamInstance)
        
         // Create MIDI output connectable
         const output = new MidiN3DConnectable.Output(
           "midiOutput", 
           [this.gui.midiOutput], 
           "MIDI Output",
           this.wamInstance.audioNode
       );

       this.context.createConnectable(output);
         this.started = true;

        this.startTime = this.context.audioCtx.currentTime;
        this.wamInstance.audioNode.scheduleEvents({
          type: "wam-transport",
          data: {
            playing: true,
            timeSigDenominator: 4,
            timeSigNumerator: 4,
            currentBar: 0,
            currentBarStarted: this.context.audioCtx.currentTime,
            tempo: this.tempo,
          },
        });
        }


        start(): void {
            this.started = true;
            this.startTime = this.context.audioCtx.currentTime;
            this.wamInstance.audioNode.scheduleEvents({
              type: "wam-transport",
              data: {
                playing: true,
                timeSigDenominator: 4,
                timeSigNumerator: 4,
                currentBar: 0,
                currentBarStarted: this.context.audioCtx.currentTime,
                tempo: this.tempo,
              },
            });
          }
          
          stop(): void {
            this.started = false;
            this.gui.playhead.position.x = this.gui.getStartX();
            this.wamInstance.audioNode.scheduleEvents({
              type: "wam-transport",
              data: {
                playing: false,
                timeSigDenominator: 4,
                timeSigNumerator: 4,
                currentBar: 0,
                currentBarStarted: this.context.audioCtx.currentTime,
                tempo: this.tempo,
              },
            });
          }

          update(): void {
            if (!this.started) return;
          
            const elapsed = this.context.audioCtx.currentTime - this.startTime;
            const currentCell = (elapsed / this.cellDuration) % this.gui.cols;
          
            const x = (currentCell * (this.gui.buttonWidth + this.gui.buttonSpacing))
                - ((this.gui.cols - 1) / 2 * (this.gui.buttonWidth + this.gui.buttonSpacing)) - this.gui.buttonWidth / 2;
            this.gui.playhead.position.x = x;
          
            const currentCol = Math.floor(currentCell);
            this.highlightActiveButtons(currentCol);
          }
          highlightActiveButtons(currentCol: number): void {
            for (let row = 0; row < this.gui.rows; row++) {
                const button = this.gui.getButton(row, currentCol);
                
                if (button && button.isActive) {
                    button.material.diffuseColor = COLOR_PLAYING; // Green for active
                    
                    setTimeout(() => {
                    if (button.isActive) {
                      if (button.mode === "control") {
                          button.material.diffuseColor = COLOR_LONG_PLAYING; // Purple
                      } else {
                          button.material.diffuseColor = COLOR_ACTIVE// Red
                      }
                  }
                    }, this.cellDuration * 1000);
                }
            }
          }
          toggleStartStopBtn(): void {
            if(!this.gui.btnStartStop.actionManager)
            this.gui.btnStartStop.actionManager = new B.ActionManager(this.gui.context.scene);
            this.gui.btnStartStop.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
                const mat = this.gui.btnStartStop.material as B.StandardMaterial;
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
            };
          


          // helpers
          convertNoteToMidi(note: string): number | null {
            // Matches notes like C4, C#4, Db4, A#10, etc.
            const noteRegex = /^([A-Ga-g])(#|b)?(\d{1,2})$/;
          
            const semitoneOffsets: Record<string, number> = {
              'C': 0,  'C#': 1,  'Db': 1,
              'D': 2,  'D#': 3,  'Eb': 3,
              'E': 4,  'Fb': 4,  // Fb is enharmonic to E
              'E#': 5, 'F': 5,   // E# is enharmonic to F
              'F#': 6, 'Gb': 6,
              'G': 7,  'G#': 8,  'Ab': 8,
              'A': 9,  'A#': 10, 'Bb': 10,
              'B': 11, 'Cb': 11, // Cb is enharmonic to B
              'B#': 0,           // B# is enharmonic to C
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
          

          //patterns
          sendPatternToPianoRoll(): void {
            const delegate = window?.WAMExtensions?.patterns?.getPatternViewDelegate(
              this.wamInstance.audioNode.instanceId
            );
            if (!delegate) return;
            delegate.setPatternState("default", this.pattern);
            console.log("sendPatternToPianoRoll", this.pattern);
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
          
            this.sendPatternToPianoRoll();
          
            // send to network
            // this._app.networkManager?.setPattern(this.id, this.pattern);
          }
          toggleNoteColor(row: number, col: number): void {
            const button = this.gui.getButton(row, col);
            if (!button) return;
          
            button.isActive = !button.isActive;
            const material = button.material as B.StandardMaterial; 
            material.diffuseColor = button.isActive
                ? COLOR_ACTIVE // Red for active
                : COLOR_INACTIVE; // Blue for inactive
           this.context.notifyStateChange('pattern');  // Triggers network sync
            this.updatePattern(row, col, button.isActive);
          }
          public setPattern(pattern: Pattern): void {
            this.pattern = pattern;
          
            // Reset grid
            this.gui.buttons.forEach(row => row.forEach(btn => {
              btn.isActive = false;
              btn.material.diffuseColor = COLOR_INACTIVE;
            }));
          
            // Apply new pattern
            pattern.notes.forEach(note => {
              const col = Math.floor(note.tick / this.ticksPerColumn);
              const row = this.gui.notes.findIndex(n => this.convertNoteToMidi(n) === note.number);
              if (row >= 0 && col >= 0 && row < this.gui.rows && col < this.gui.cols) {
                const btn = this.gui.getButton(row, col);
                if (btn) {
                  btn.isActive = true;
                  (btn.material as B.StandardMaterial).diffuseColor = COLOR_ACTIVE;
                }
              }
            });
          
            this.sendPatternToPianoRoll();
          }
          


        
        toggleNoteColorwithControl(row: number, col: number): void {
          const button = this.getButton(row, col);
          if (!button || !this.isAKeyPressed) return;
        
          if (!this.currentControlSequence) {
            this.startNewControlSequence(row, col);
          } else {
            const seq = this.currentControlSequence;
        
            if (seq.row !== row) {
              console.warn("Cannot create sequence across multiple rows.");
              return;
            }
            if (col < seq.startCol) {
              console.warn(" Cannot create sequence backwards.");
              return;
            }
            this.expandControlSequence(row, seq.startCol, col);
          }
        }
        private rowControlBorders: { [row: number]: B.Mesh[] } = {};

        private startNewControlSequence(row: number, col: number): void {
          // 1. Activate the first cell
          const button = this.getButton(row, col)!;
          button.isActive = true;
          button.mode     = "control";
          (button.material as B.StandardMaterial).diffuseColor = COLOR_LONG_PLAYING;
        
          // 2. Create a single-tick note in the pattern
          const midiNumber = this.convertNoteToMidi(this.gui.notes[row]);
          if (midiNumber == null) return;
          const tick = col * this.ticksPerColumn;
          this.pattern.notes.push({ tick, number: midiNumber, duration: this.ticksPerColumn, velocity: 100 });
          this.sendPatternToPianoRoll();
        
          // 3. Visual border (yellow translucent box)
          // const WORLD_BAR_HEIGHT = 0.4;

          const border = B.MeshBuilder.CreateBox(
          `groupBorder_${row}_${col}`,
          {
          width : this.gui.buttonWidth,// * 1.2,
          height:0.3,//this.gui.root.scaling.y,  // compensate Y-scale
          depth : this.gui.buttonDepth //* 1.25,
          },
          this.gui.context.scene
          );

          const mat = new B.StandardMaterial(`borderMat_${row}_${col}`, this.gui.context.scene);
          mat.emissiveColor   = B.Color3.Yellow();
          mat.disableLighting = true;
          mat.alpha           = 0.5;
          border.material     = mat;
          border.isPickable   = true;
          border.parent       = this.gui.root;

          /* ✨ NEW — take the **real** button position that already includes scrolling offset */
          const btnPos = this.getButton(row, col)!.position;

          border.position.copyFrom(btnPos);                 // same X & Z as the clicked key
          border.position.y = btnPos.y// + WORLD_BAR_HEIGHT;  // float just above it
          if (!this.rowControlBorders[row]) this.rowControlBorders[row] = [];
          this.rowControlBorders[row].push(border);



          // 4. Store sequence
          this.currentControlSequence = { row, startCol: col, startTick: tick, midiNumber, borderMesh: border };
          console.log("currentSequence",this.currentControlSequence)
          // 5. Border click deletes the sequence
          border.actionManager = new B.ActionManager(this.gui.context.scene);
          border.actionManager.registerAction(
            new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => this.deleteControlSequence(row, col))
          );
        }
        private expandControlSequence(row: number, startCol: number, currentCol: number): void {
          if (currentCol < startCol || !this.currentControlSequence) return;
        
          // Force all cells purple & active
          for (let c = startCol; c <= currentCol; c++) {
            const btn = this.getButton(row, c);
            if (!btn) continue;
            btn.isActive = true;
            btn.mode     = "control";
            (btn.material as B.StandardMaterial).diffuseColor = COLOR_LONG_PLAYING;
          }
        
          // Update note duration
          const seq = this.currentControlSequence;
          const noteObj = this.pattern.notes.find(n => n.number === seq.midiNumber && n.tick === seq.startTick);
          if (noteObj) {
            noteObj.duration = (currentCol - startCol + 1) * this.ticksPerColumn;
            this.sendPatternToPianoRoll();
          }
        
          // Resize / move border mesh
          const centerCol = (startCol + currentCol) / 2;
          const widthCols = currentCol - startCol + 1;

          // size of one gap relative to a button, e.g. 0.2 / 2  = 0.1
          const spacingRatio = this.gui.buttonSpacing / this.gui.buttonWidth;
          seq.borderMesh.scaling.x = widthCols + (widthCols - 1) * spacingRatio;
          seq.borderMesh.position.x =
            (centerCol - (this.gui.cols - 1) / 2) * (this.gui.buttonWidth + this.gui.buttonSpacing);
        }

        
        private deleteControlSequence(row: number, startCol: number): void {
          const midiNumber = this.convertNoteToMidi(this.gui.notes[row]);
          const tick = startCol * this.ticksPerColumn;
          const idx  = this.pattern.notes.findIndex(n => n.number === midiNumber && n.tick === tick);
          if (idx !== -1) this.pattern.notes.splice(idx, 1);
        
          const border = this.gui.context.scene.getMeshByName(`groupBorder_${row}_${startCol}`) as B.Mesh;
          if (border) {
            const widthCols = Math.round(border.scaling.x);
            for (let c = startCol; c < startCol + widthCols; c++) {
              const btn = this.getButton(row, c);
              if (btn) {
                btn.isActive = false;
                btn.mode = "none";
                (btn.material as B.StandardMaterial).diffuseColor = new B.Color3(0.2, 0.6, 0.8);
              }
            }
            border.dispose();
            const list = this.rowControlBorders[row];
            if (list) {
              this.rowControlBorders[row] = list.filter(m => m !== border);
              if (!this.rowControlBorders[row].length) delete this.rowControlBorders[row];
            }

          }
          this.currentControlSequence = null;
          this.sendPatternToPianoRoll();
        }


        
  
          //action Manager
          
          initActions(): void {
            for (let row = 0; row < this.gui.rows; row++) {
                for (let col = 0; col < this.gui.cols; col++) {
                    const button = this.gui.buttons[row][col];
                    button.actionManager = new B.ActionManager(this.gui.context.scene);
          
                    button.actionManager.registerAction(
                      new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
                        if (this.isAKeyPressed) {
                          this.toggleNoteColorwithControl(row, col);   // ④ NEW
                        } else {
                          this.toggleNoteColor(row, col);
                        }
                      })
                    );
                    
                }
            }

            // Menu action Manager
            this.gui.menuButton.actionManager = new B.ActionManager(this.gui.context.scene);
            this.gui.menuButton.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
              this.menu.show();
            }));
          }
          public setColumns(newColumnCount: number): void {
            // Clear existing buttons from the scene
            this.gui.buttons.forEach(row => {
                row.forEach(button => button.dispose());
            });
        
            // Clear existing colorBoxes
              this.gui.keyBoard.forEach(key => {
                key.dispose();
            });
        
            // clear exeisting this.pattern
            this.pattern.notes = [];
            this.pattern.length = newColumnCount * this.ticksPerColumn;
            this.sendPatternToPianoRoll();
        
            // Update the column count
            this.gui.cols = newColumnCount;
        
            // Recalculate grid boundaries
            this.gui.recalculateGridBoundaries();
        
            // Recompute desired width
            const newWidth = (this.gui.endX - this.gui.startX) + (this.gui.buttonWidth * 2 + this.gui.buttonSpacing) + (this.gui.buttonWidth + this.gui.buttonSpacing * 2);
            
            // Apply scaling to baseMesh instead of recreating
            const currentWidth = this.gui.block.getBoundingInfo().boundingBox.extendSize.x * 2;
            this.gui.block.scaling.x = newWidth / currentWidth;
        
            // Recreate the grid with the new number of columns
            this.gui.createGrid();
            this.gui.updateRowVisibility();
            console.log(`Grid updated with ${newColumnCount} columns.`);

                  // output position
                  const baseY = this.gui.block.position.y;
                  const baseZ = this.gui.block.position.z;
                  // display boundingbox
                  this.gui.block.showBoundingBox = true;
                  const baseLength = this.gui.block.getBoundingInfo().boundingBox.extendSize.x;
        
            this.gui.midiOutput.position.set(baseLength, baseY, baseZ+1)
            
            // Update the playhead to span the new grid
            if (this.gui.playhead) {
                this.gui.playhead.position.x = this.gui.getStartX();
            }
        this.initActions()
      }



      public setRows(newRowCount: number): void {
        // Clear existing buttons
        this.gui.buttons.forEach(row => {
            row.forEach(button => button.dispose());
        });
    
        // Clear existing colorBoxes
        this.gui.keyBoard.forEach(key => {
            key.dispose();
        });
    
        // Update the row count
        this.gui.rows = newRowCount;
    
        // Adjust the visible row count if necessary
        if (this.gui.rows < this.gui.visibleRowCount) {
            this.gui.visibleRowCount = this.gui.rows;
        }
    
        // Recalculate grid boundaries
        this.gui.recalculateGridBoundaries();
  
        // Recreate the grid with the new number of rows
        this.gui.createGrid();
        this.gui.updateRowVisibility();
        console.log(`Grid updated with ${newRowCount} rows.`);
        this.initActions()  
      }

      setTempo(bpm: number): void {
        this.tempo = bpm;
        this.beatDuration = 60 / this.tempo;
        this.cellDuration = this.beatDuration / this.timeSignatureDenominator;
        this.stop()
        this.start()
        // this.sendPatternToPianoRoll();
      }
      
      
      
        

      async getState(key: string): Promise<any> {

        if (key === 'pattern') {
          return { pattern: this.pattern, timestamp: Date.now() };
        }
      }
      
      async setState(key: string, state: any): Promise<void> {
        if (key === 'pattern') {
          this.setPattern(state.pattern);  // Apply remote pattern
          
        }
      }
      getStateKeys(): string[] { return ['pattern']}
  
      async dispose(): Promise<void> {
          
      }
      
}



export const PianoRollN3DFactory: Node3DFactory<PianoRollN3DGUI,PianoRollN3D> = {

    label: "pianoroll",

    description: "A 3D Piano Roll for Node3D",

    tags: ["sequencer", "midi", "generator", "pattern", "piano_roll"],
    
    async createGUI(context) { return new PianoRollN3DGUI(context) },

    async create(context, gui) { return new PianoRollN3D(context,gui) },

}