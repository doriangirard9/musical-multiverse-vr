import { AbstractMesh, ActionManager, Behavior, ExecuteCodeAction, Observable, PointerEventTypes } from "@babylonjs/core"
import { FullHoldBehaviour } from "./FullHoldBehaviour"




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

    constructor(){}

    get isDragging(): boolean { return this._isDragging }

    private target!: AbstractMesh
    private _isDragging = false
    private holdBehaviour?: FullHoldBehaviour

    init(): void {}

    attach(target: AbstractMesh): void {
        this.target = target

        // On grab
        const action = target.actionManager ??= new ActionManager(target.getScene())

        this.target.isPickable = true
        const onPickDown = new ExecuteCodeAction(ActionManager.OnPickDownTrigger, ()=>{
            this.grab()
            const o = this.target.getScene().onPointerObservable.add((evt) => {
                if(evt.type === PointerEventTypes.POINTERUP){ // PointerUp
                    o.remove()
                    this.release()
                }
            })
        })
        action.registerAction(onPickDown)
        this.detach = ()=>{
            this.release()
            action.unregisterAction(onPickDown)
        }
    }

    grab(){
        this._isDragging = true
        if(!this.holdBehaviour){
            this.onGrabObservable.notifyObservers()
            this.holdBehaviour = new FullHoldBehaviour()
            this.holdBehaviour.on_move = ()=>this.onMoveObservable.notifyObservers()
            this.holdBehaviour.on_rotate = ()=>this.onRotateObservable.notifyObservers()
            this.target.addBehavior(this.holdBehaviour)
        }
    }

    release(){
        this._isDragging = false
        if(this.holdBehaviour){
            this.onReleaseObservable.notifyObservers()
            this.target.removeBehavior(this.holdBehaviour)
            this.holdBehaviour = undefined
        }
    }

    detach!: ()=>void
}