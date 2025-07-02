import { AbstractMesh, ActionManager, Behavior, CreateBox, ExecuteCodeAction, Mesh, PointerEventTypes, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { HoldBehaviour } from "./HoldBehavior";


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
    
    init(): void {}

    attach(target: TransformNode): void {
        this.target = target
    }

    detach(): void {
        this.target = undefined
        this.setBoundingBoxes()
    }

    setBoundingBoxes(boxes?: {min:Vector3, max: Vector3}[]): void{
        if(this.boundingMesh){
            this.boundingMesh.dispose()
            this.hovered = false
            this.selected = false
            this.update()
        }

        const meshes = [] as Mesh[]
        console.log(boxes)
        for (const box of boxes) {
            const max = box.max.clone().addInPlaceFromFloats(0.1, 0.1, 0.1)
            const min = box.min.clone().subtractFromFloats(0.1, 0.1, 0.1)
            const size = max.subtract(min)
            const center = size.scale(0.5).addInPlace(min)
            const mesh = CreateBox(`box`,{width: size.x, height: size.y, depth: size.z}, this.target!.getScene())
            mesh.position.copyFrom(center)
            meshes.push(mesh)
        }
        
        this.boundingMesh = Mesh.MergeMeshes(meshes, true)!!
        this.boundingMesh.visibility = 0.4

        const action = this.boundingMesh.actionManager = new ActionManager(this.target!.getScene())
        action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, ()=>{
            this.hovered = true
            this.update()
        }))

        action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, ()=>{
            this.hovered = false
            this.update()
        }))

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
    }

    private hovered = false
    
    private selected = false

    private holdBehavior?: HoldBehaviour

    private update(){
        // Visibility
        if(this.selected) this.boundingMesh.visibility = 0.6
        else if(this.hovered) this.boundingMesh.visibility = 0.3
        else this.boundingMesh.visibility = 0.1

        // Hold
        if(this.selected && !this.holdBehavior){
            this.holdBehavior = new HoldBehaviour()
            this.target.addBehavior(this.holdBehavior)
        }
        else if(!this.selected && this.holdBehavior){
            this.target.removeBehavior(this.holdBehavior)
            this.holdBehavior = undefined
        }

    }
    
}