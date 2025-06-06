import { Color3, Color4, type AbstractMesh } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { MidiN3DConnectable } from "../../tools";
import { Node3DContext } from "../../Node3DContext";
import * as B from "@babylonjs/core";
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
  // 🎨 Color Constants
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
    buttons: NoteButtonMesh[][] = [];

    // Grid properties
    rows: number= 16;
    cols: number= 16;

    // grid edges
    private startX!: number;
    private endX!: number;
    private startZ!: number;
    private endZ!: number;

    private buttonWidth = 2;
    private buttonHeight = 0.2;
    private buttonDepth = 0.5;
    private buttonSpacing = 0.2;

    // Scrolling properties
    private _visibleRowCount: number = 7;
    private _startRowIndex: number = 0;
    
    // piano Black and white buttons
    private colorBoxes: B.Mesh[] = [];

  // scrolling 
  private _btnScrollUp!: B.Mesh;
  private _btnScrollDown!: B.Mesh;
    
  //menu
//   private menu!  : PianoRollSettingsMenu;

    private btnStartStop!: B.Mesh;
    private isBtnStartStop: boolean = true;


  private notes: string[] = [
    "C3", "C#3", "D3", "D#3", "E3", "F3", "F#3", "G3", "G#3", "A3", "A#3", "B3",
    "C4", "C#4", "D4", "D#4", "E4", "F4", "F#4", "G4", "G#4", "A4", "A#4", "B4"
  ];

    constructor(private context: Node3DGUIContext) {
        const {babylon:B,tools:T} = context
        this.tool= T;
        this.root = new B.TransformNode("pianoroll root", context.scene)
        this.root.scaling.setAll(0.1);

        this.instantiate()
        // Adjust visible row count if necessary
        if (this.rows < this._visibleRowCount) {
        this._visibleRowCount = this.rows;
        }

        // this._recalculateGridBoundaries();
        // this._createBaseMesh();
        // this._createGrid();
        // this._createPlayhead();
        // this._createControlButtons();
        // this._createScrollButtons();
        // this._updateRowVisibility();

    }

    public async instantiate(): Promise<void> {

        this.createGrid();
        this._recalculateGridBoundaries()
        this._createBaseMesh();
          this.createPlayhead();
        //   this._initActionManager();//move to node
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


          

          // this.start();
          this.startStopButton();
        //   this.menu = new PianoRollSettingsMenu(this.context.scene, this);

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

    // add click action to toggle start stop button
    this.btnStartStop.actionManager = new B.ActionManager(this.context.scene);
    this.btnStartStop.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
    
    const mat = this.btnStartStop.material as B.StandardMaterial;
    // check if color is green

    // TODO : move to Node
    // if (this.isBtnStartStop) {
    //   this.stop()

    //   this.isBtnStartStop = false;
    //   mat.diffuseColor = B.Color3.Red();
    //   // textBlock.text = "Stop";
    //   } else {
    //     this.start()

    //     this.isBtnStartStop = true;
    //     mat.diffuseColor = B.Color3.Green();
    //     // textBlock.text = "Start";
    //   }
    }));

    
    
  }

    async dispose(): Promise<void> {
        // this.root.dispose()


    }

    get worldSize() { return 4 }

}


class PianoRollN3D implements Node3D{

    constructor(context: Node3DContext, private gui: PianoRollN3DGUI){
        const {tools:T} = context
        const pianoRoll = this
        context.addToBoundingBox(gui.block)

        // Create midi output
        
        const midi_output = new T.MidiN3DConnectable.ListOutput("midioutput", [gui.midiOutput], "MIDI Output")
        context.createConnectable(midi_output)

        // Create note buttons

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