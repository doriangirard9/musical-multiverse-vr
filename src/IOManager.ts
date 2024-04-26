import {IOEvent} from "./types.ts";
import * as B from "@babylonjs/core";
import {AudioNode3D} from "./audioNodes3D/AudioNode3D.ts";

export class IOManager {
    private _inputNode: B.Nullable<AudioNode3D> = null;
    private _outputNode: B.Nullable<AudioNode3D> = null;
    private readonly _scene: B.Scene;

    constructor(scene: B.Scene) {
        this._scene = scene;
    }

    public onIOEvent(event: IOEvent): void {
        if (event.pickType === "down") {
            if (event.type === 'input') {
                this._inputNode = event.node;
            }
            else {
                this._outputNode = event.node;
            }
        }
        else if (event.pickType === "up") {
            if (event.type === 'input') {
                if (this._outputNode) {
                    if (event.node.id === this._outputNode.id) {
                        alert("Can't connect a node to itself");
                        this._outputNode = null;
                    }
                    else {
                        this.connectNodes(this._outputNode, event.node);
                        this._outputNode = null;
                    }
                }
                else if (this._inputNode) {
                    alert("You have to connect an output node");
                    this._inputNode = null;
                }
            }
            else {
                if (this._inputNode) {
                    if (event.node.id === this._inputNode.id) {
                        alert("Can't connect a node to itself");
                        this._inputNode = null;
                    }
                    else {
                        this.connectNodes(event.node, this._inputNode);
                        this._inputNode = null;
                    }
                }
                else if (this._outputNode) {
                    alert("You have to connect an input node");
                    this._outputNode = null;
                }
            }
        }
        else {
            this._inputNode = null;
            this._outputNode = null;
        }
    }

    public connectNodes(outputNode: AudioNode3D, inputNode: AudioNode3D): void {
        outputNode.connect(inputNode.getAudioNode());
        outputNode.addInputNode(inputNode);

        if (!inputNode.inputMesh || !outputNode.outputMesh) throw new Error("Input or output mesh not found");

        const point1: B.Vector3 = inputNode.baseMesh.position.add(inputNode.inputMesh.position);
        const point2: B.Vector3 = outputNode.baseMesh.position.add(outputNode.outputMesh.position);

        B.MeshBuilder.CreateLines('link', {points: [point1, point2]}, this._scene);
    }
}