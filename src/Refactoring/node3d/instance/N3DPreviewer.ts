import { ActionManager, Color3, CreateBox, ExecuteCodeAction, PointerDragBehavior, TransformNode } from "@babylonjs/core";
import { N3DShared } from "./N3DShared";
import { Node3DFactory, Node3DGUI } from "../Node3D";
import { N3DHighlighter } from "./utils/N3DHighlighter";
import { Node3dManager } from "../../app/Node3dManager";


/**
 * A previewer is a non persisted, non synchronized node3d GUI that, when dragged, create
 * an instance of the node3d it show.
 */
export class N3DPreviewer{
    
    root
    gui!: Node3DGUI
    highlighter!: N3DHighlighter

    constructor(
        private shared: N3DShared,
        private factory: Node3DFactory<Node3DGUI,any>,
        private kind: string,
        private node3DManager: Node3dManager,
        private inWorldSize: boolean = false
    ){
        this.root = new TransformNode(`${factory.label} preview root`, shared.scene)
    }

    async initialize(){
        const shared = this.shared

        // Intialize the GUI visual
        const highlighter = this.highlighter = new N3DHighlighter(shared.highlightLayer)
        const gui = this.gui = await this.factory.createGUI({
            babylon: shared.babylon,
            highlight: (...args)=>highlighter.highlight(...args),
            unhighlight: (...args)=>highlighter.unhighlight(...args),
            materialLight: shared.materialLight,
            materialMat: shared.materialMat,
            materialMetal: shared.materialMetal,
            materialShiny: shared.materialShiny,
            scene: shared.scene,
            tools: shared.tools
        })
        if(this.inWorldSize)gui.root.scaling.setAll(gui.worldSize)

        // Create a hitbox
        let size = 1.1
        if(this.inWorldSize) size *= gui.worldSize
        const hitbox = CreateBox("preview hitbox", {size}, shared.scene)
        hitbox.visibility = .5

        gui.root.parent = hitbox
        hitbox.parent = this.root

        // On drag, create a new node3D
        const drag_behaviour = new PointerDragBehavior()
        hitbox.addBehavior(drag_behaviour)

        drag_behaviour.onDragStartObservable.add(async(event)=>{
            setTimeout(function timefn(){
                
                if(drag_behaviour.dragging){
                    hitbox.scaling.setAll(hitbox.scaling.y*.9+gui.worldSize*.1)
                    setTimeout(timefn,20)
                }
            },20)
        })

        drag_behaviour.onDragEndObservable.add(async(event)=>{
            const dragDistance = hitbox.position.length()
            if(dragDistance>4){
                console.log(dragDistance)
                console.log("node3dManager",this.node3DManager)
                const new_node3d = await this.node3DManager.createNode3d(this.kind)
                if(new_node3d!=null){
                    new_node3d.boundingBoxMesh.setAbsolutePosition(hitbox.absolutePosition.clone())
                }
            }
            drag_behaviour.dragging = false
            hitbox.position.setAll(0)
            if(!this.inWorldSize)hitbox.scaling.setAll(1)
        })

        const action = hitbox.actionManager ??= new ActionManager()
        const _onover = action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, ()=>{
            this.shared.highlightLayer.addMesh(hitbox, Color3.Green())
        }))!!
        
        const _onout = action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, ()=>{
            this.shared.highlightLayer.removeMesh(hitbox)
        }))!!
    }

    dispose(){
        this.highlighter.dispose()
        this.gui.dispose()
        this.root.dispose()
    }
}