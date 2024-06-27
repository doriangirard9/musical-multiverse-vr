import {IOEvent, TubeParams} from "./types.ts";
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
        this.createArc(outputNode, inputNode);
    }

    // Function to create an arc (edge) with an arrowhead
    private createArc(outputNode: AudioNode3D, inputNode: AudioNode3D): void  {
        // Ensure that the spheres have updated positions by getting the absolute positions
        var start = outputNode.outputMesh!.getAbsolutePosition();
        var end = inputNode.inputMesh!.getAbsolutePosition();

        // Calculate the direction of the arc
        var direction = end.subtract(start).normalize();

        // Adjust the end position to account for the radius of the incoming sphere and arrow length
        var arrowLength = 0.7; // Length of the arrowhead
        var sphereRadius = 0.25; // Radius of the sphere
        var adjustedEnd = end.subtract(direction.scale(sphereRadius + arrowLength / 2));

        // Create the path for the tube
        var path = [start, adjustedEnd];

        var optionsTube = { path: path, radius: 0.1, tessellation: 8, updatable: true };
        var tube = B.MeshBuilder.CreateTube("tube", optionsTube, this._scene);

        // Create the arrowhead (cone)
        var arrow = B.MeshBuilder.CreateCylinder("arrow", { height: arrowLength, diameterTop: 0, diameterBottom: 0.5, tessellation: 8 }, this._scene);
        arrow.position = adjustedEnd;
        arrow.parent = tube;

        // Orient the arrowhead to point in the direction of the edge
        arrow.lookAt(end);
        arrow.rotate(B.Axis.X, Math.PI / 2, B.Space.LOCAL);

        // Color the arrowhead
        var arrowMaterial = new B.StandardMaterial("arrowMat",this._scene );
        arrowMaterial.diffuseColor = new B.Color3(0, 0, 1);
        arrow.material = arrowMaterial;
        
        tube.isPickable = false;
        
        const tubeParams: TubeParams = {options:optionsTube, TubeMesh: tube,OutputMesh:outputNode.outputMesh!,inputMesh: inputNode.inputMesh!,arrow:arrow} ;
        outputNode.outputArcs.push(tubeParams);
        inputNode.inputArcs.push(tubeParams);


        // startNode.outputArcs.push(tube);
        // endNode.inputArcs.push(tube);
        // tube.startNode = startNode;
        // tube.endNode = endNode;
        // tube.arrow = arrow;
    }
}