import { AbstractMesh, ActionManager, Behavior, ExecuteCodeAction, Observable, PointerEventTypes, TransformNode } from "@babylonjs/core"
import { FullHoldBehaviour } from "./FullHoldBehaviour"
import { InputGrabBehavior } from "../../xr/inputs/tools/InputGrabBehavior"
import { PointerInput } from "../../xr/inputs/PointerInput"




/**
 * FullHoldBehaviour allows the user to hold and manipulate an object in VR.
 * When the target is grabbed it can then be dragged around using FullHoldBehaviour.
 */
export class HoldableBehaviour implements Behavior<AbstractMesh> {
  
    name = HoldableBehaviour.name

    onMoveObservable = new Observable<void>()
    onRotateObservable = new Observable<void>()
    onGrabObservable = new Observable<void>()
    onReleaseObservable = new Observable<void>()

    constructor(private moved?: TransformNode){}

    get isDragging(): boolean { return this._isDragging }

    private target!: AbstractMesh
    private _isDragging = false
    private holdBehaviour?: FullHoldBehaviour

    init(): void {}

    attach(target: AbstractMesh): void {
        this.target = target

        this.target.isPickable = true
        const grab = new InputGrabBehavior(
            pointer=>{
                this.grab(pointer)
            },
            _=>{
                this.release()
            },
        )

        target.addBehavior(grab)

        this.detach = ()=>{
            target.removeBehavior(grab)
        }
    }

    grab(pointer: PointerInput){
        this._isDragging = true
        if(!this.holdBehaviour){
            const target = this.moved ?? this.target
            this.onGrabObservable.notifyObservers()
            this.holdBehaviour = new FullHoldBehaviour(pointer)
            this.holdBehaviour.on_move = ()=>this.onMoveObservable.notifyObservers()
            this.holdBehaviour.on_rotate = ()=>this.onRotateObservable.notifyObservers()
            target.addBehavior(this.holdBehaviour)
        }
    }

    release(){
        this._isDragging = false
        if(this.holdBehaviour){
            const target = this.moved ?? this.target
            this.onReleaseObservable.notifyObservers()
            target.removeBehavior(this.holdBehaviour)
            this.holdBehaviour = undefined
        }
    }

    detach!: ()=>void
}