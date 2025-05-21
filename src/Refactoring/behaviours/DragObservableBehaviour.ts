import { AbstractMesh, ActionEvent, ActionManager, Behavior, ExecuteCodeAction, IAction, Observable, Observer, PointerEventTypes, PointerInfo } from "@babylonjs/core";

/*export class DragObservableBehaviour implements Behavior<AbstractMesh>{
    
    readonly name: string = "DragObservableBehaviour"

    readonly onStart = new Observable<void>()
    readonly onMove = new Observable<{xDelta:number, yDelta:number}>()
    readonly onEnd = new Observable<void>()

    declare private target: AbstractMesh

    private actions = [] as IAction[]
    private observables = [] as Observer<any>[]
    
    init(): void {
        
    }
    
    attach(target: AbstractMesh): void {
        this.target = target
        this.observables.push(target.getScene().onPointerObservable.add(this.tickDrag.bind(this)))
        this.actions.push(target.actionManager!!.registerAction(new ExecuteCodeAction(ActionManager.OnPickDownTrigger, this.startDrag.bind(this)))!!)
        this.actions.push(target.actionManager!!.registerAction(new ExecuteCodeAction(ActionManager.OnPickUpTrigger, this.endDrag.bind(this)))!!)
        this.actions.push(target.actionManager!!.registerAction(new ExecuteCodeAction(ActionManager.OnPickOutTrigger, this.endDrag.bind(this)))!!)

        function startDragging(event: B.ActionEvent){
            console.log(event)
            textValuePlane.setEnabled(true)
            textValuePlane.setAbsolutePosition(target.getAbsolutePosition())
            textValuePlane.position.y += target.getBoundingInfo().boundingBox.extendSize.y/2
            textValueBlock.text = settings.stringify(settings.getValue())
            pointer = event.sourceEvent.pointerId
            target.getScene().onPointerObservable.removeCallback(tickDragging)
            event.pointerX
        }

        function endDragging(event: B.ActionEvent){
            textValuePlane.setEnabled(false)
            target.getScene().onPointerObservable.removeCallback(tickDragging)
        }
    }

    detach(): void {
        this.observables.forEach(it=>it.remove())
        this.actions.forEach(it=>this.target.actionManager!!.unregisterAction(it))
    }


    private pointerId = 0
    private mouseX = 0
    private mouseY = 0

    startDrag(event: ActionEvent){
        this.pointerId = event.sourceEvent.pointerId as number
        this.mouseX = event.
        this.mouseY = event.additionalData. as number
        this.onStart.notifyObservers()
    }

    tickDrag(info: PointerInfo) {
        if(info.type !== PointerEventTypes.POINTERMOVE && info.event.pointerId == this.pointerId){
            info.pickInfo!!.pickedPoint
        }
    }

    endDrag(event: ActionEvent){
        this.onEnd.notifyObservers()
    }
    
}*/