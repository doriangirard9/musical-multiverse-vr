import { AbstractMesh, ActionManager, Color3, ExecuteCodeAction, HighlightLayer, Mesh, MeshBuilder, Observable, Observer } from "@babylonjs/core";
import { App } from "../../App";
import { DragBoundingBox } from "../DragBoundingBox";
import { Pedal3D, Pedal3DConnectable } from "./Pedal3D";
import { RotateBoundingBox } from "../RotateBoundingBox";
import { IOEvent } from "../../types";
import { WamNode } from "@webaudiomodules/api";
import { INetworkObject } from "../../network/types";


/**
 * Every pedal3d has to be wrapped in a Pedal3DObject.
 * The Pedal3DObject defined the behaviours shared by all pedal3d.
 */
export class Pedal3DObject implements INetworkObject<AudioNodeState>{

    /** Observable for input and output connections events */
    readonly ioObservable: Observable<IOEvent>

    /** The drag and rotation bounding box of the pedal */
    readonly boundingBox: AbstractMesh
    
    private dragBehaviour
    private rotateBehaviour

    constructor(
        private app: App,
        public core: Pedal3D
    ){
        // Create a bounding box whome size is the same as the core of the pedal
        this.boundingBox = MeshBuilder.CreateBox("boundingBox pedal 3d", {
            width: core.bounds.x,
            height: core.bounds.y,
            depth: core.bounds.z
        }, app.scene)

        core.mesh.setParent(this.boundingBox)
        core.mesh.position.set(0,0,0)

        /* Dragging and rotating */
        this.dragBehaviour = new DragBoundingBox(app)
        this.rotateBehaviour = new RotateBoundingBox(app)

        /* Input and output connections */
        const highlightLayer = new HighlightLayer(`highlight-output`, this.app.scene)
        const ioObservable = this.ioObservable = new Observable<IOEvent>()
        const pedalObject = this

        function treatConnectable(connectable: Pedal3DConnectable, color: Color3, type: "output"|"input", index: number){
            const {mesh,audioNode,setConnect} = connectable
            mesh.actionManager = new ActionManager(app.scene)

            // Highlight the connectable meshes when the mouse is over
            mesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, ()=>{
                for(let m of mesh.getChildMeshes(false)) if(m instanceof Mesh) highlightLayer.addMesh(m, color)
                if(mesh instanceof Mesh) highlightLayer.addMesh(mesh, color)
                console.log(mesh)
            }))

            mesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, ()=>{
                for(let m of mesh.getChildMeshes(false)) if(m instanceof Mesh) highlightLayer.removeMesh(m)
                if(mesh instanceof Mesh) highlightLayer.removeMesh(mesh)
            }))

            // Send a dragging/dropping event when the connectable is dragged/dropped
            // The events are use to create the connections between the pedals by another part of the program
            mesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnLeftPickTrigger, () => {
                console.log("down")
                ioObservable.notifyObservers({type, pickType: 'down', pedal: pedalObject, index});
            }))
            mesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickUpTrigger, () => {
                ioObservable.notifyObservers({type, pickType: 'up', pedal: pedalObject, index});
            }))
            mesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickOutTrigger, () => {
                ioObservable.notifyObservers({type, pickType: 'out', pedal: pedalObject, index});
            }))
            
        }
        for(let i=0; i<core.inputs.length; i++) treatConnectable(core.inputs[i], Color3.Green(), "input", i)
        for(let i=0; i<core.outputs.length; i++) treatConnectable(core.outputs[i], Color3.Red(), "output", i)
        

        // Use a behaviour to make sure the pedal3dobject is initialized and disposed properly
        this.core.mesh.addBehavior({
            name: "pedal3dobject behaviour",
            attach: this.init.bind(this),
            detach: this.dispose.bind(this),
            init() {},
        })

    }

    private squeezeObserver?: Observer<any>

    private init(){
        this.boundingBox.addBehavior(this.dragBehaviour)
        
        const xrRightInputStates = this.app.xrManager.xrInputManager.rightInputStates
        this.squeezeObserver=xrRightInputStates['xr-standard-squeeze'].onButtonStateChangedObservable.add((event)=>{
            console.log(event.value)
            if(event.value<1){
                this.boundingBox.addBehavior(this.dragBehaviour)
                this.boundingBox.removeBehavior(this.rotateBehaviour)
            }
            else{
                this.boundingBox.removeBehavior(this.dragBehaviour)
                this.boundingBox.addBehavior(this.rotateBehaviour)
            }
        });
    }

    private dispose(){
        this.squeezeObserver?.remove()
    }


    
    private input_connection: {from:number, to:number}[] = []

    private output_connection: {from:number, to:number}[] = []


    /** Connect to another node */
    connectTo(node: AudioNode, wamnode?: WamNode, )


}