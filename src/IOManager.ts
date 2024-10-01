import {IOEvent, TubeParams} from "./types.ts";
import * as B from "@babylonjs/core";
import {AudioNode3D} from "./audioNodes3D/AudioNode3D.ts";
import { v4 as uuid } from 'uuid';
import { MessageManager } from "./MessageManger.ts";
import { App } from "./App.ts";


export class IOManager {
    private _inputNode: B.Nullable<AudioNode3D> = null;
    private _outputNode: B.Nullable<AudioNode3D> = null;
    private readonly _scene: B.Scene;
    private virtualTube!: B.Mesh |null;
    private virtualArrow: B.Mesh | null = null;
    private virtualDragPoint!: B.TransformNode | null;
    private pointerDragBehavior!: B.PointerDragBehavior;
    private highlightLayer!: B.HighlightLayer |null;
    private messageManager!: MessageManager;
    constructor(scene: B.Scene,app:App) {
        this._scene = scene;
        this.messageManager = new MessageManager(this._scene,app.xrManager)
    }

    public onIOEvent(event: IOEvent): void {
        if (event.pickType === "down") {
            if (event.type === 'input') {
                if (event.node.inputMesh) {
                console.log("input node")
                this.createVirtualDragPoint(event.node.inputMesh);
                this._inputNode = event.node;
                }
            }
            else {
                if(event.node.outputMesh){
                this.createVirtualDragPoint(event.node.outputMesh);
                this._outputNode = event.node;
                }
            }
        }
        else if (event.pickType === "up") {
            if (event.type === 'input') {
                if (this._outputNode) {
                    if (event.node.id === this._outputNode.id) {
                        // alert("Can't connect a node to itself");
                        this.messageManager.showMessage("Can't connect a node to itself",3000)
                        this._outputNode = null;
                        this.deleteVirtualTube();

                    }
                    else {
                        this.connectNodes(this._outputNode, event.node);
                        this._outputNode = null;
                        this.deleteVirtualTube();

                    }
                }
                else if (this._inputNode) {
                    // alert("You have to connect an output node");
                    this.messageManager.showMessage("You have to connect an output node",3000)
                    this._inputNode = null;
                    this.deleteVirtualTube();

                }
            }
            else {
                if (this._inputNode) {
                    if (event.node.id === this._inputNode.id) {
                        // alert("Can't connect a node to itself");
                        this.messageManager.showMessage("Can't connect a node to itself",3000)

                        this._inputNode = null;
                        this.deleteVirtualTube();

                    }
                    else {
                        this.connectNodes(event.node, this._inputNode);
                        this._inputNode = null;
                        this.deleteVirtualTube();

                    }
                }
                else if (this._outputNode) {
                    this.messageManager.showMessage("You have to connect an input node",3000)
                    // alert("You have to connect an input node");
                    this._outputNode = null;
                    this.deleteVirtualTube();

                }
                this.deleteVirtualTube();
            }
        }
        else {
            this.deleteVirtualTube();
            this._inputNode = null;
            this._outputNode = null;
        
        }
    }

    
    // public deleteArc(outputNode: AudioNode3D, inputNode: AudioNode3D): void {
    //     console.log("Deleting arc between nodes", outputNode.id, inputNode.id);
    //     outputNode.outputArcs.forEach((tubeParams: TubeParams, index: number): void => {
    //         if (tubeParams.inputMesh && tubeParams.inputMesh.id === inputNode.inputMesh!.id) {
    //             console.log("Disposing TubeMesh and arrow");
    //             tubeParams.TubeMesh.dispose();
    //             tubeParams.arrow.dispose();
    //             outputNode.outputArcs.splice(index, 1);
    //         }
    //     });
    //     inputNode.inputArcs.forEach((tubeParams: TubeParams, index: number): void => {
    //         if (tubeParams.OutputMesh && tubeParams.OutputMesh.id === outputNode.outputMesh!.id) {
    //             console.log("Disposing TubeMesh and arrow");
    //             tubeParams.TubeMesh.dispose();
    //             tubeParams.arrow.dispose();
    //             inputNode.inputArcs.splice(index, 1);
    //         }
    //     });
    // }
    


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
        var tube = B.MeshBuilder.CreateTube(`tube-${uuid()}`, optionsTube, this._scene);

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
        
        tube.isPickable = true;
        // Add ActionManager to the tube for click handling
        tube.actionManager = new B.ActionManager(this._scene);
        tube.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
            // this.deleteArc(tube, outputNode, inputNode);
        }));
        const tubeParams: TubeParams = {options:optionsTube, TubeMesh: tube,OutputMesh:outputNode.outputMesh!,inputMesh: inputNode.inputMesh!,arrow:arrow,outputNode:outputNode,inputNode:inputNode} ;
        outputNode.outputArcs.push(tubeParams);
        inputNode.inputArcs.push(tubeParams);



    }



    public deleteArc(arc:B.Mesh,outputNode: AudioNode3D, inputNode: AudioNode3D): void {
        console.log("Deleting arc between nodes", outputNode.id, inputNode.id);
    
        // Remove the arc from the output node
        outputNode.outputArcs = outputNode.outputArcs.filter((tubeParams: TubeParams) => {
            if (tubeParams.inputMesh && arc === tubeParams.TubeMesh) {
                console.log("Disposing TubeMesh and arrow");
                tubeParams.outputNode.disconnect(tubeParams.inputNode.getAudioNode());
                tubeParams.TubeMesh.dispose();
                tubeParams.arrow.dispose();
                return false;
            }
            return true;
        });
    
        // Remove the arc from the input node
        inputNode.inputArcs = inputNode.inputArcs.filter((tubeParams: TubeParams) => {
            if (tubeParams.OutputMesh && arc === tubeParams.TubeMesh) {
                console.log("Disposing TubeMesh and arrow");
                // // tubeParams.outputNode.getAudioNode.disconnect(tubeParams.inputNode.getAudioNode());
                // tubeParams.outputNode.disconnect(tubeParams.inputNode.getAudioNode());
                tubeParams.TubeMesh.dispose();
                tubeParams.arrow.dispose();
                return false;
            }
            return true;
        });


    }
    
    
    public createVirtualTube(node: B.Mesh): void {
        const start = node!.getAbsolutePosition();
        const end = node!.getAbsolutePosition();
        const path = [start, end];

        this.virtualTube = B.MeshBuilder.CreateTube("tube", {
            path: path,
            radius: 0.1,
            tessellation: 8,
            updatable: true
        }, this._scene);
        this.virtualTube.isPickable = false;

        // implement arrow
        var arrowLength = 0.7; // Length of the arrowhead
        var sphereRadius = 0.25; // Radius of the sphere
        var direction = end.subtract(start).normalize();
        var adjustedEnd = end.subtract(direction.scale(sphereRadius + arrowLength / 2));

        // Create the arrowhead (cone)
        this.virtualArrow = B.MeshBuilder.CreateCylinder("arrow", { height: arrowLength, diameterTop: 0, diameterBottom: 0.5, tessellation: 8 }, this._scene);
        this.virtualArrow.position = adjustedEnd;
        this.virtualArrow.parent = this.virtualTube;

        // Orient the arrowhead to point in the direction of the edge
        this.virtualArrow.lookAt(end);
        this.virtualArrow.rotate(B.Axis.X, Math.PI / 2, B.Space.LOCAL);

        // Color the arrowhead
        var arrowMaterial = new B.StandardMaterial("arrowMat",this._scene );
        arrowMaterial.diffuseColor = new B.Color3(0, 0, 1);
        this.virtualArrow.material = arrowMaterial;
    }


    
public createVirtualDragPoint(node: B.Mesh): void {
    console.log("Creating virtual tube");
    this.createVirtualTube(node);

    console.log("Creating drag point");
    const dragPoint = new B.TransformNode("dragPoint", this._scene);
    
    dragPoint.position = node.getAbsolutePosition(); //: new B.Vector3(0, 0, 0);

    this.pointerDragBehavior = new B.PointerDragBehavior({ dragPlaneNormal: new B.Vector3(0, 0, 1) });
    dragPoint.addBehavior(this.pointerDragBehavior);
    let meshColor : B.Color3;
    if(node.material instanceof B.StandardMaterial){
        meshColor = node.material.diffuseColor;
        this.highlightLayer = new B.HighlightLayer(`hl-input-${node.id}`, this._scene);
        this.highlightLayer.addMesh(node as B.Mesh,  meshColor);
    };

    

    
    this.pointerDragBehavior.onDragObservable.add((event) => {
        if (dragPoint && this.virtualTube) {


                dragPoint.position.set(event.dragPlanePoint.x, event.dragPlanePoint.y,event.dragPlanePoint.z)// node.getAbsolutePosition().z);//event.dragPlaneNormal.z);//event.pointerInfo?.pickInfo?.pickedMesh?.getAbsolutePosition().z!)

            B.MeshBuilder.CreateTube("tube", {
                path: [node!.getAbsolutePosition(), dragPoint.position],
                radius: 0.1,
                tessellation: 8,
                instance: this.virtualTube
            }, this._scene);
        }

            // Update arrow
            this.virtualArrow!.position =  dragPoint.position;
            var arrowLength = 0.7; // Length of the arrowhead
            var sphereRadius = 0.25; // Radius of the sphere
            let start = node.getAbsolutePosition();
            let end = dragPoint.getAbsolutePosition();
            let direction = end.subtract(start).normalize();
            var adjustedEnd = end.subtract(direction.scale(sphereRadius + arrowLength / 2));
            this.virtualArrow!.lookAt(adjustedEnd);
            this.virtualArrow!.rotate(B.Axis.X, -Math.PI / 2, B.Space.LOCAL);
    });
    this.virtualArrow!.isPickable = false;
    
    dragPoint.position = node.position.clone();
    this.virtualDragPoint = dragPoint;

    // Verify node is pickable
    if (node instanceof B.Mesh) {
        node.isPickable = true;
    }


    this.pointerDragBehavior.startDrag();

}

    
    
    
    
    public deleteVirtualTube(): void {
        if (this.virtualTube) {
            this.virtualTube.dispose();
            this.virtualTube = null;
        }
        if (this.virtualDragPoint) {
            this.virtualDragPoint.dispose();
            this.virtualDragPoint = null;
        }
        if(this.highlightLayer){
            this.highlightLayer.dispose();
            this.highlightLayer = null;
        }
        if(this.virtualArrow){
            this.virtualArrow.dispose();
            this.virtualArrow = null;
        }
    }
    
}