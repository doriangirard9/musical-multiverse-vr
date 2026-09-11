import { AbstractMesh, Behavior, Observable, TransformNode } from "@babylonjs/core"
import { FullHoldBehaviour } from "./FullHoldBehaviour"
import { PointerInput } from "../../xr/inputs/PointerInput"
import { RotationCorrectionBehaviour } from "./CorrectRotationBehaviour"
import { TwoPointerHoldBehaviour } from "./TwoPointerHoldBehaviour"
import { InputMultiGrabBehavior } from "../../node3d/tools"
import { InputCapability } from "../../xr/inputs/InputCapability"




/**
 * HoldableBehaviour allows the user to hold and manipulate an object in VR.
 * When the target is grabbed it can then be dragged around using FullHoldBehaviour.
 * TODO: Les FullHoldBehaviours s'accumulent à chaque clique à l'infinie.
 */
export class HoldableBehaviour implements Behavior<AbstractMesh> {
  
    get name (){ return this.constructor.name }

    onMoveObservable = new Observable<void>()
    onRotateObservable = new Observable<void>()
    onGrabObservable = new Observable<void>()
    onReleaseObservable = new Observable<void>()

    constructor(
        private moved?: TransformNode,

        /**
         * The capability filtering the hold. While it is disabled the target cannot be taken, and
         * a target already held is released. Held whatever the capability when there is none.
         */
        private capability?: InputCapability,
    ){}

    get isDragging(): boolean { return this._isDragging }

    attachedNode!: AbstractMesh
    private _isDragging = false
    private holdBehaviour?: FullHoldBehaviour
    private twoPointerHoldBehaviour?: TwoPointerHoldBehaviour

    init(): void {}

    attach(target: AbstractMesh): void {
        this.detach()

        this.attachedNode = target

        this.attachedNode.isPickable = true
        // Only the pointers the capability is enabled for hold the target: the other hand may
        // point at it with its trigger down without taking it.
        const allowed = () => grab.grabbers.filter(pointer => this.capability?.isEnabledFor(pointer) !== false)
        const grab = new InputMultiGrabBehavior(
            _=>{
                this.grab(allowed())
            },
            _=>{
                this.grab(allowed())
            },
            undefined,
            this.capability,
        )

        target.addBehavior(grab)

        // A pointer losing the capability in the middle of a hold lets go.
        const onPointerDisable = () => this.grab(allowed())
        this.capability?.onPointerDisable.add(onPointerDisable)

        const correction = new RotationCorrectionBehaviour()
        target.addBehavior(correction)

        this.detach = ()=>{
            this.capability?.onPointerDisable.delete(onPointerDisable)
            if(grab) target.removeBehavior(grab)
            if(correction) target.removeBehavior(correction)
            this.detach = ()=>{}
        }
    }

    grab(pointers: PointerInput[]){
        const target = this.moved ?? this.attachedNode

        // No pointer
        if(pointers.length===0){
            if(this._isDragging) this.onReleaseObservable.notifyObservers()
            this._isDragging = false
        }
        else{
            if(!this._isDragging) this.onGrabObservable.notifyObservers()
            this._isDragging = true
        }

        // Simple hold behaviour
        if(pointers.length===1){
            const pointer = pointers[0]
            if(!this.holdBehaviour){
                this.holdBehaviour = new FullHoldBehaviour(pointer)
                this.holdBehaviour.on_move = ()=>this.onMoveObservable.notifyObservers()
                this.holdBehaviour.on_rotate = ()=>this.onRotateObservable.notifyObservers()
                target.addBehavior(this.holdBehaviour)
            }
        }
        else{
            if(this.holdBehaviour){
                this.holdBehaviour.attachedNode.removeBehavior(this.holdBehaviour)
            }
            this.holdBehaviour = undefined
        }
        
        // Two pointer hold behaviour
        if(pointers.length>=2){
            const pointer1 = pointers[0]
            const pointer2 = pointers[1]
            if(!this.twoPointerHoldBehaviour){
                this.twoPointerHoldBehaviour = new TwoPointerHoldBehaviour(pointer1, pointer2)
                this.twoPointerHoldBehaviour.on_move = ()=>this.onMoveObservable.notifyObservers()
                target.addBehavior(this.twoPointerHoldBehaviour)
            }
        }
        else{
            if(this.twoPointerHoldBehaviour) this.twoPointerHoldBehaviour.attachedNode.removeBehavior(this.twoPointerHoldBehaviour)
            this.twoPointerHoldBehaviour = undefined
        }
    }

    detach: ()=>void = ()=>{}
}