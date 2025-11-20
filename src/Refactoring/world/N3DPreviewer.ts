import { ActionManager, Color3, CreateBox, ExecuteCodeAction, PointerDragBehavior, TransformNode } from "@babylonjs/core";
import { N3DShared } from "../node3d/instance/N3DShared";
import { Node3DGUI } from "../node3d/Node3D";
import { N3DHighlighter } from "../node3d/instance/utils/N3DHighlighter";
import { Node3dManager } from "../app/Node3dManager";
import { Node3DInstance } from "../node3d/instance/Node3DInstance";
import { N3DText } from "../node3d/instance/utils/N3DText";
import { HoldableBehaviour } from "../behaviours/boundingBox/HoldableBehaviour";


/**
 * A previewer is a non persisted, non synchronized node3d GUI that, when dragged, create
 * an instance of the node3d it show.
 */
export class N3DPreviewer{
    
    root
    gui!: Node3DGUI
    highlighter!: N3DHighlighter
    drag!: HoldableBehaviour
    text!: N3DText
    on_start_drag?: ()=>void
    on_drop?: (node3d:Node3DInstance)=>void
    on_no_drop?: ()=>void

    constructor(
        private shared: N3DShared,
        private kind: string,
        private node3DManager: Node3dManager,
        private inWorldSize: boolean = false
    ){
        this.root = new TransformNode(`${kind} preview root`, shared.scene)
    }

    async initialize(){
        const shared = this.shared
        const factory = await this.node3DManager.builder.getFactory(this.kind)
        if(!factory)throw new Error(`Node3D factory for kind "${this.kind}" not found`)

        // Intialize the GUI visual
        const highlighter = this.highlighter = new N3DHighlighter(shared.highlightLayer)
        const gui = this.gui = await factory.createGUI({...highlighter.binded(), ...shared})
        if(this.inWorldSize)gui.root.scaling.setAll(gui.worldSize*Node3DInstance.SIZE_MULTIPLIER)

        // Create a hitbox
        let size = 1.1
        if(this.inWorldSize) size *= gui.worldSize*Node3DInstance.SIZE_MULTIPLIER
        const hitbox = CreateBox("preview hitbox", {size}, shared.scene)
        hitbox.visibility = .3

        // Create a text display
        const text = this.text = new N3DText(`n3preview ${this.kind} name`, [hitbox])
        text.set(factory.label)

        gui.root.parent = hitbox
        hitbox.parent = this.root

        // On drag, create a new node3D
        const drag_behaviour = this.drag = new HoldableBehaviour()
        hitbox.addBehavior(drag_behaviour)

        drag_behaviour.onGrabObservable.add(async()=>{
            this.on_start_drag?.()
            setTimeout(function timefn(){
                if(drag_behaviour.isDragging){
                    hitbox.scaling.setAll(hitbox.scaling.y*.9+gui.worldSize*Node3DInstance.SIZE_MULTIPLIER*.1)
                    setTimeout(timefn,20)
                }
            },20)
        })

        drag_behaviour.onReleaseObservable.add(async()=>{
            const dragDistance = hitbox.position.length()
            if(dragDistance>hitbox.getBoundingInfo().boundingBox.extendSizeWorld.x*2){
                const new_node3d = await this.node3DManager.createNode3d(this.kind)
                if(new_node3d!=null){
                    new_node3d.boundingBoxMesh.setAbsolutePosition(hitbox.absolutePosition.clone())
                    new_node3d.boundingBoxMesh.rotationQuaternion = hitbox.absoluteRotationQuaternion
                    this.on_drop?.(new_node3d)
                }
                else this.on_no_drop?.()
            }
            else this.on_no_drop?.()
            hitbox.position.setAll(0)
            hitbox.rotationQuaternion?.set(0,0,0,1)
            hitbox.rotation.setAll(0)
            if(!this.inWorldSize)hitbox.scaling.setAll(1)
        })

        const action = hitbox.actionManager ??= new ActionManager()
        action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, ()=>{
            this.shared.highlightLayer.removeExcludedMesh(hitbox);
            this.shared.highlightLayer.addMesh(hitbox, Color3.Green())
            text.updatePosition()
            text.show()
        }))!!
        
        action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, ()=>{
            this.shared.highlightLayer.removeMesh(hitbox)
            text.hide()
        }))!!
    }

    dispose(){
        this.highlighter.dispose()
        this.gui.dispose()
        this.root.dispose()
        this.text.dispose()
    }
}