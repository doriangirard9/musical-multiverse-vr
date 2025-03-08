import { AbstractMesh, MeshBuilder, Observer, TransformNode } from "@babylonjs/core";
import { App } from "../../App";
import { DragBoundingBox } from "../DragBoundingBox";
import { Pedal3D } from "./Pedal3D";
import { RotateBoundingBox } from "../RotateBoundingBox";


/**
 * Every pedal3d has to be wrapped in a Pedal3DObject.
 * The Pedal3DObject defined the behaviours shared by all pedal3d.
 */
export class Pedal3DObject{
    
    private dragBehaviour: DragBoundingBox
    private rotateBehaviour: RotateBoundingBox
    readonly boundingBox: AbstractMesh

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

        /* Use a behaviour to make sure the pedal3dobject is initialized and disposed properly */
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




}