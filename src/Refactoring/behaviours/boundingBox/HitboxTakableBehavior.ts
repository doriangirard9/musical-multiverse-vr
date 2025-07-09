import { AbstractMesh, ActionManager, Behavior, CreateBox, ExecuteCodeAction, Mesh, PointerEventTypes, Space, TransformNode, Vector3 } from "@babylonjs/core";
import { MoveHoldBehaviour } from "./MoveHoldBehaviour";
import { RotateHoldBehaviour } from "./RotateHoldBehaviour";
import { InputManager } from "../../xr/inputs/InputManager";


export class TakableBehavior implements Behavior<TransformNode> {

    name = "TakableBehavior"

    on_move: () => void = () => {}
    on_rotate: () => void = () => {}
    on_select: () => void = () => {}
    on_unselect: () => void = () => {}

    constructor(
        private objectName: string,
    ){}



    private target!: TransformNode
    private boundingMesh!: AbstractMesh
    private disposable: {remove():void}[] = []
    
    init(): void {}

    attach(target: TransformNode): void {
        this.target = target
    }

    detach(): void {
        this.setBoundingBoxes()
    }

    setBoundingBoxes(boxes?: {min:Vector3, max: Vector3}[]): void{

        if(this.boundingMesh){
            this.boundingMesh.dispose()
            this.disposable?.forEach(it=> it.remove())
            this.disposable.length = 0
            this.hovered = false
            this.selected = false
            this.update()
        }

        if(boxes){
            const meshes = [] as Mesh[]

            for (const box of boxes) {
                const max = box.max.clone().addInPlaceFromFloats(0.1, 0.1, 0.1)
                const min = box.min.clone().subtractFromFloats(0.1, 0.1, 0.1)
                const size = max.subtract(min)
                const center = size.scale(0.5).addInPlace(min)
                const mesh = CreateBox(this.objectName,{width: size.x, height: size.y, depth: size.z}, this.target!.getScene())
                mesh.position.copyFrom(center)
                meshes.push(mesh)
            }
            
            this.boundingMesh = Mesh.MergeMeshes(meshes, true)!!
            this.boundingMesh.setPivotPoint(this.target.getAbsolutePosition(),Space.WORLD)
            this.boundingMesh.visibility = 0.4

            // Hovering
            const action = this.boundingMesh.actionManager = new ActionManager(this.target!.getScene())
            action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, ()=>{
                this.hovered = true
                this.update()
            }))

            action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, ()=>{
                this.hovered = false
                this.update()
            }))

            // Pick down
            action.registerAction(new ExecuteCodeAction(ActionManager.OnPickDownTrigger, ()=>{
                this.selected = true
                this.update()
                const o = this.target.getScene().onPointerObservable.add((evt) => {
                    if(evt.type === PointerEventTypes.POINTERUP){ // PointerUp
                        o.remove()
                        this.selected = false
                        this.update()
                    }
                })
            }))

            // Switch between hold and rotate
            const inputs = InputManager.getInstance()
            this.disposable.push(
                inputs.right_squeeze.on_down.add(()=>{
                    this.rotate = true
                    this.update()
                }),
                inputs.right_squeeze.on_up.add(()=>{
                    this.rotate = false
                    this.update()
                }),
            )
                

        }

    }

    private hovered = false
    
    private selected = false

    private rotate = false

    private holdBehavior?: MoveHoldBehaviour|RotateHoldBehaviour

    private update(){
        // Visibility
        if(this.selected) this.boundingMesh.visibility = 0.6
        else if(this.hovered) this.boundingMesh.visibility = 0.3
        else this.boundingMesh.visibility = 0.1

        // Unselected
        if(!this.selected && this.holdBehavior){
            this.holdBehavior.detach()
            this.holdBehavior = undefined
        }

        // Hold
        if(this.selected && !this.rotate && !(this.holdBehavior && this.holdBehavior instanceof MoveHoldBehaviour)){
            this.holdBehavior?.detach()
            this.holdBehavior = new MoveHoldBehaviour()
            this.holdBehavior.on_move = ()=>{
                this.target.setAbsolutePosition(this.boundingMesh.absolutePosition)
                this.target.rotation = this.boundingMesh.rotation
            } 
            this.boundingMesh.addBehavior(this.holdBehavior)
        }

        // Rotate
        if(this.selected && this.rotate && !(this.holdBehavior && this.holdBehavior instanceof RotateHoldBehaviour)){
            this.holdBehavior?.detach()
            this.holdBehavior = new RotateHoldBehaviour()
            this.holdBehavior.on_rotate = ()=>{
                this.target.rotation = this.boundingMesh.rotation
            }
            this.boundingMesh.addBehavior(this.holdBehavior)
        }

    }
    
}