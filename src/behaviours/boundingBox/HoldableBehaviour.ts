import { AbstractMesh, Behavior, Observable, TransformNode } from "@babylonjs/core"
import { FullHoldBehaviour } from "./FullHoldBehaviour"
import { PointerInput } from "../../xr/inputs/PointerInput"
import { RotationCorrectionBehaviour } from "./CorrectRotationBehaviour"
import { TwoPointerHoldBehaviour } from "./TwoPointerHoldBehaviour"
import { InputMultiGrabBehavior } from "../../node3d/tools"




/**
 * HoldableBehaviour allows the user to hold and manipulate an object in VR.
 * When the target is grabbed it can then be dragged around using FullHoldBehaviour.
 */
export class HoldableBehaviour implements Behavior<AbstractMesh> {
  
    get name (){ return this.constructor.name }

    onMoveObservable = new Observable<void>()
    onRotateObservable = new Observable<void>()
    onGrabObservable = new Observable<void>()
    onReleaseObservable = new Observable<void>()

    constructor(private moved?: TransformNode){}

    get isDragging(): boolean { return this._isDragging }

    private target!: AbstractMesh
    private _isDragging = false
    private holdBehaviour?: FullHoldBehaviour
    private twoPointerHoldBehaviour?: TwoPointerHoldBehaviour

    init(): void {}

    attach(target: AbstractMesh): void {
        this.detach()

        this.target = target

        this.target.isPickable = true
        const grab = new InputMultiGrabBehavior(
            _=>{
                this.grab(grab.grabbers)
            },
            _=>{
                this.grab(grab.grabbers)
            },
        )

        target.addBehavior(grab)

        const correction = new RotationCorrectionBehaviour()
        target.addBehavior(correction)

        this.detach = ()=>{
            target.removeBehavior(grab)
            target.removeBehavior(correction)
            this.detach = ()=>{}
        }
    }

    grab(pointers: PointerInput[]){
        this._isDragging = true

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
                const target = this.moved ?? this.target
                this.holdBehaviour = new FullHoldBehaviour(pointer)
                this.holdBehaviour.on_move = ()=>this.onMoveObservable.notifyObservers()
                this.holdBehaviour.on_rotate = ()=>this.onRotateObservable.notifyObservers()
                target.addBehavior(this.holdBehaviour)
            }
        }
        else{
            const target = this.moved ?? this.target
            if(this.holdBehaviour) target.removeBehavior(this.holdBehaviour)
            this.holdBehaviour = undefined
        }
        
        // Two pointer hold behaviour
        if(pointers.length>=2){
            const pointer1 = pointers[0]
            const pointer2 = pointers[1]
            if(!this.twoPointerHoldBehaviour){
                const target = this.moved ?? this.target
                this.twoPointerHoldBehaviour = new TwoPointerHoldBehaviour(pointer1, pointer2)
                this.twoPointerHoldBehaviour.on_move = ()=>this.onMoveObservable.notifyObservers()
                target.addBehavior(this.twoPointerHoldBehaviour)
            }
        }
        else{
            const target = this.moved ?? this.target
            if(this.twoPointerHoldBehaviour) target.removeBehavior(this.twoPointerHoldBehaviour)
            this.twoPointerHoldBehaviour = undefined
        }
    }

    detach: ()=>void = ()=>{}
}