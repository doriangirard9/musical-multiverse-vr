import { Color3, Color4, type AbstractMesh } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { MidiN3DConnectable } from "../../tools";
import { Node3DContext } from "../../Node3DContext";
import * as B from "@babylonjs/core";
import { WebAudioModule } from "@webaudiomodules/api";
import { WamInitializer } from "../../../app/WamInitializer";
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
  

// colors 
  // Color Constants
  const COLOR_ACTIVE = new B.Color3(1, 0, 0);         // Red
  const COLOR_INACTIVE = new B.Color3(0.2, 0.6, 0.8); // Blue
  const COLOR_PLAYING = new B.Color3(0, 1, 0);        // Green
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
    rows: number= 16;
    cols: number= 16;

    // grid edges
    private startX!: number;
    private endX!: number;
    private startZ!: number;
    private endZ!: number;

    buttonWidth = 2;
    buttonHeight = 0.2;
    buttonDepth = 0.5;
    buttonSpacing = 0.2;

    // Scrolling properties
    private _visibleRowCount: number = 7;
    private _startRowIndex: number = 0;
    
    // grid buttons(buttons: blue keys,colorBoxes: black and white keys)
    buttons: NoteButtonMesh[][] = [];
    keyBoard: B.Mesh[] = [];

  // scrolling 
  private _btnScrollUp!: B.Mesh;
  private _btnScrollDown!: B.Mesh;
    
  //menu
//   private menu!  : PianoRollSettingsMenu;

    public btnStartStop!: B.Mesh;


  private notes: string[] = [
    "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
    "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4"
  ];

    constructor(public context: Node3DGUIContext) {
        const {babylon:B,tools:T} = context
        this.tool= T;
        this.root = new B.TransformNode("pianoroll root", context.scene)
        this.root.scaling.setAll(0.1);

        // Adjust visible row count if necessary
        if (this.rows < this._visibleRowCount) {
            this._visibleRowCount = this.rows;
        }
        this.instantiate()
    }

    public async instantiate(): Promise<void> {

      this._recalculateGridBoundaries()
      this.createGrid();
        this._createBaseMesh();
          this.createPlayhead();
          this._createScrollButtons();
          this._updateRowVisibility();
        //   this.createMenuButton();// to do : add menu class
          this._recalculateGridBoundaries()

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
        //   this.menu = new PianoRollSettingsMenu(this.context.scene, this);

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
    const blackKeys = ["C#3", "D#3", "F#3", "G#3", "A#3", "C#4", "D#4", "F#4", "G#4", "A#4"];
    return blackKeys.includes(note);
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
        if (this.keyBoard[row]) {
            const colorBox = this.keyBoard[row];

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
        ? COLOR_INACTIVE // Active
        : COLOR_DISABLED; // Inactive

    // Disable the scroll down button if at the bottom
    const materialDown = this._btnScrollDown.material as B.StandardMaterial;
    materialDown.diffuseColor = this._startRowIndex + this._visibleRowCount < this.rows
        ? COLOR_INACTIVE // Active
        : COLOR_DISABLED; // Inactive
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
      this.root
    ); 
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


class PianoRollN3D implements Node3D{

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
      private notes: string[] = [];
      private isBtnStartStop: boolean = true;

    constructor(context: Node3DContext, private gui: PianoRollN3DGUI){
        const {tools:T} = context
        this.context = context;
        this.beatDuration = 60 / this.tempo;
        this.cellDuration = this.beatDuration / this.timeSignatureDenominator;
        this.pattern = {
            length: this.gui.cols * this.ticksPerColumn,
            notes: []
        };
        this.notes = [
            "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
            "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4"
        ];
        
        
        const pianoRoll = this
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
                            button.material.diffuseColor = button.isActive
                                ? COLOR_ACTIVE // Red for active
                                : COLOR_INACTIVE; // Blue for inactive
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
          
            // send to network
            // this._app.networkManager?.setPattern(this.id, this.pattern);
          }
          toggleNoteColor(row: number, col: number): void {
            const button = this.gui.getButton(row, col);
            if (!button) return;
          
            button.isActive = !button.isActive;
            const material = button.material as B.StandardMaterial; // <-- Cast to StandardMaterial
            material.diffuseColor = button.isActive
                ? COLOR_ACTIVE // Red for active
                : COLOR_INACTIVE; // Blue for inactive
          
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
              const row = this.notes.findIndex(n => this.convertNoteToMidi(n) === note.number);
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
          
          
          //action Manager
          
          initActions(): void {
            for (let row = 0; row < this.gui.rows; row++) {
                for (let col = 0; col < this.gui.cols; col++) {
                    const button = this.gui.buttons[row][col];
                    button.actionManager = new B.ActionManager(this.gui.context.scene);
          
                    button.actionManager.registerAction(new B.ExecuteCodeAction(
                        B.ActionManager.OnPickTrigger,
                        () => this.toggleNoteColor(row, col)
                    ));
                }
            }
          }
          
    async setState(key: string, state: any): Promise<void> { }

    async getState(key: string): Promise<any> { }

    getStateKeys(): string[] { return []}

    async dispose(): Promise<void> {
        
    }

}



export const PianoRollN3DFactory: Node3DFactory<PianoRollN3DGUI,PianoRollN3D> = {

    label: "pianoroll",
    
    async createGUI(context) { return new PianoRollN3DGUI(context) },

    async create(context, gui) { return new PianoRollN3D(context,gui) },

}