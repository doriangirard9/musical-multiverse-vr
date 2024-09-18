import * as B from "@babylonjs/core";
import * as Tone from "tone";
import {AudioNode3D} from "./AudioNode3D.ts";
import {AudioNodeState} from "../network/types.ts";
import { BoundingBox } from "./BoundingBox.ts";
import {ControllerBehaviorManager} from "../xr/BehaviorControllerManager.ts";

export class StepSequencer3D extends AudioNode3D {

    public _synths!: Tone.Synth[];
    private _notes: string[] = ["C4", "D4", "E4", "F4"];
    private _grid: {mesh: B.Mesh, isActivated: boolean}[][] = [];

    constructor(scene: B.Scene, audioCtx: AudioContext, id: string) {
        super(scene, audioCtx, id);
    }

    public async instantiate(): Promise<void> {
        try {
        if (!this._scene || !this._audioCtx) {
            throw new Error("Scene or AudioContext is not initialized.");
        }
        this._app.menu.hide();
        this._synths = Array.from({length: 4}, () => new Tone.Synth());
        Tone.Transport.start();

        this._createBaseMesh();
        this._createGrid();

        this._configSequencerLoop();

        // gizmo
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

        this._initActionManager();

        this._createOutput(new B.Vector3(this.baseMesh.position.x + 4.2, this.baseMesh.position.y, this.baseMesh.position.z));

        const bo = new BoundingBox(this, this._scene, this.id, this._app);
        this.boundingBox = bo.boundingBox;
        ControllerBehaviorManager.addBoundingBox(bo);
        // shadow
        // this._app.shadowGenerator.addShadowCaster(this.baseMesh);
        console.log("StepSequencer instantiated successfully.");
    
    } catch (error) {
        console.error("Error instantiating StepSequencer: ", error);
    }
}
    // disconnect each synth from the merger node
    public disconnect(_destination: AudioNode): void {
        this._synths.forEach((synth: Tone.Synth) => {
            synth.disconnect();
        });
    }
    
    
    public delete():void{
     // Disconnect each synth from the merger node
     this._synths.forEach((synth: Tone.Synth) => {
        synth.disconnect();
    });

    // Disconnect the merger node from the audio context
    const mergerNode = this.getAudioNode();
    mergerNode.disconnect();

    // Call the parent class's delete method to handle any additional cleanup
    super.delete();
    }

    protected _createBaseMesh(): void {
        this.baseMesh = B.MeshBuilder.CreateBox('box', { width: 8, height: 0.2, depth: 4 }, this._scene);

        const material = new B.StandardMaterial('material', this._scene);
        material.diffuseColor = new B.Color3(0, 0, 0);
        this.baseMesh.material = material;
    }

    private _createGrid(): void {
        for (let i: number = 0; i < this._notes.length; i++) {
            this._grid.push([]);
            for (let j: number = 0; j < 8; j++) {
                this._createNoteButton(i, j);
            }
        }
    }

    private _createNoteButton(row: number, column: number): void {
        try{

        const buttonMesh: B.Mesh = B.MeshBuilder.CreateBox(`button${row}${column}`, { width: 0.8, height: 0.2, depth: 0.8 }, this._scene);
        buttonMesh.position.x = column - 3.5;
        buttonMesh.position.y = 0.1;
        buttonMesh.position.z = row- 1.5;
        buttonMesh.parent = this.baseMesh;

        // color
        const buttonMaterial = new B.StandardMaterial('material', this._scene);
        buttonMaterial.diffuseColor = new B.Color3(0, 0, 1);
        buttonMesh.material = buttonMaterial;

        this._grid[row].push({mesh: buttonMesh, isActivated: false});

        // actions
        if(!buttonMesh.actionManager){
        console.log("doesnt exist")
            buttonMesh.actionManager = new B.ActionManager(this._scene);
        }
        buttonMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
            this._grid[row][column].isActivated = !this._grid[row][column].isActivated;
            this._updateNoteColor(row, column);
        }));
    }catch(e){
        console.log("Error in action manager",e);
    }
    }

    private _updateNoteColor(row: number, column: number): void {
        const buttonMaterial = this._grid[row][column].mesh.material as B.StandardMaterial;
        buttonMaterial.diffuseColor = this._grid[row][column].isActivated ? new B.Color3(1, 0, 0) : new B.Color3(0, 0, 1);
    }

    private _configSequencerLoop(): void {
        let beat: number = 0;
        const repeat = (time: Tone.Unit.Time): void => {

            this._grid.forEach((row, index: number): void => {
                let synth: Tone.Synth<Tone.SynthOptions> = this._synths[index];
                let note: {mesh: B.Mesh, isActivated: boolean} = row[beat];

                if (note.isActivated) {
                    synth.triggerAttackRelease(this._notes[index], "8n", time);
                    this._onPlayButtonAnimation(note.mesh);
                }
            });
            beat = (beat + 1) % 8;
        };

        Tone.Transport.scheduleRepeat(repeat, "8n");
    };

    private _onPlayButtonAnimation(button: B.Mesh): void {
        const standardMaterial = button.material as B.StandardMaterial;
        standardMaterial.diffuseColor = new B.Color3(0, 1, 0);

        setTimeout(() => {
            standardMaterial.diffuseColor = new B.Color3(1, 0, 0);
        }, 100);
    }

    public connect(destination: AudioNode): void {
        this._synths.forEach((synth: Tone.Synth) => synth.connect(destination));
    }

    public getAudioNode(): AudioNode {
        const merger: ChannelMergerNode = this._audioCtx.createChannelMerger(4);
        this._synths.forEach((synth: Tone.Synth, index: number) => synth.connect(merger, 0, index));
        console.log("get audio node merger",merger)
        return merger;
    }

    public getState(): AudioNodeState {
        const parameters: {[name: string]: number} = {};

        this._grid.forEach((row, rowIndex: number): void => {
            row.forEach((note, i: number): void => {
                parameters[`note${rowIndex}:${i}`] = note.isActivated ? 1 : 0;
            });
        });

        const inputNodes: string[] = [];
        this.inputNodes.forEach((node: AudioNode3D): void => {
            inputNodes.push(node.id);
        });

        return {
            id: this.id,
            name: 'stepSequencer',
            position: { x: this.boundingBox.position.x, y: this.boundingBox.position.y, z: this.boundingBox.position.z },
            rotation: { x: this.boundingBox.rotation.x, y: this.boundingBox.rotation.y, z: this.boundingBox.rotation.z },
            // position: { x: this.baseMesh.position.x, y: this.baseMesh.position.y, z: this.baseMesh.position.z },
            // rotation: { x: this.baseMesh.rotation.x, y: this.baseMesh.rotation.y, z: this.baseMesh.rotation.z },
            inputNodes: inputNodes,
            parameters: parameters
        };
    }

    public setState(state: AudioNodeState): void {
        super.setState(state);

        this._grid.forEach((row, rowIndex: number): void => {
            row.forEach((note, i: number): void => {
                note.isActivated = state.parameters[`note${rowIndex}:${i}`] === 1;
                this._updateNoteColor(rowIndex, i);
            });
        });
    }
}