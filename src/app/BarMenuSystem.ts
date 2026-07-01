import { AbstractMesh, CreatePlane, Ray, TransformNode } from "@babylonjs/core"
import { Node3DNetwork } from "../network/Node3DNetwork"
import { SceneManager } from "./SceneManager"
import { Node3DInstance } from "../node3d/instance/Node3DInstance"
import { BlocksMenu, BMenuMenu } from "../menus/BlocksMenu"
import { TargetManager } from "./TargetManager"
import { ContextMenuSystem } from "./ContextMenuSystem"
import { Serialization } from "./Serialization"


const DEBUG_BAR_MENU = false
const HOVERING_DETECTION_SIZE = 1.3

/**
 * The BarMenuSystem is responsible for creating and managing the bar menus for each Node3DInstance in the scene.
 * Each Node3DInstance will have a bar menu that is displayed as a billboarded plane above the node's bounding box.
 * 
 * To modify the block menu, check {@link createMenuConfig}.
 * To add complexe 3d menus, check {@link createMenu}.
 */
export class BarMenuSystem {


    // Instance
    static _instance?: BarMenuSystem

    static async initialize(...network: ConstructorParameters<typeof BarMenuSystem>){
        this._instance = new BarMenuSystem(...network)
    }

    static getInstance(): BarMenuSystem {
        if(!this._instance) throw new Error("BarMenuSystem not initialized. Call initialize() first.")
        return this._instance
    }


    constructor(
        private scenes: SceneManager,
        private nodes: Node3DNetwork,
        private targets: TargetManager,
        private context: ContextMenuSystem,
    ){
        for(const target of targets.controllerToTarget.values()){
            target.onNewTarget.add(target=>{
                if(target.new.node){
                    this.createMenuFor(target.new.node)
                }
            })
        }
    }

    private showns = new Set<Node3DInstance>()

    private createMenuFor(node: Node3DInstance){
        if(this.showns.has(node)) return
        
        const that = this
        
        let plane = CreatePlane("node3d-plane", {size:1}, this.scenes.getScene())
        plane.visibility = DEBUG_BAR_MENU ? 0.5 : 0
        plane.isPickable = false
        plane.billboardMode = AbstractMesh.BILLBOARDMODE_ALL

        let collisionPlane = CreatePlane("node3d-plane-collision", {size:1}, this.scenes.getScene())
        collisionPlane.visibility = DEBUG_BAR_MENU ? 0.5 : 0
        collisionPlane.isPickable = false
        collisionPlane.billboardMode = AbstractMesh.BILLBOARDMODE_ALL
        collisionPlane.parent = plane
        collisionPlane.scaling.setAll(HOVERING_DETECTION_SIZE)

        // Place the bounding plane
        const placeMenu = (mesh:AbstractMesh)=>{
            const diameter = (()=>{
                const size = mesh.absoluteScaling.x
                const face_diagonal = Math.sqrt(size*size + size*size)
                const cube_diagonal = Math.sqrt(face_diagonal*face_diagonal + size*size)
                // The plane should perfectly cover the bounding box, for any rotation.
                // But because of perspective, we need to make it slightly larger.
                return cube_diagonal
            })()
            const center = mesh.absolutePosition
            plane.scaling.copyFromFloats(diameter, diameter, diameter)
            plane.position.copyFromFloats(center.x, center.y, center.z)
        }
        const o = node.onMove.add(placeMenu)
        placeMenu(node.boundingBoxMesh)
        this.showns.add(node)

        // Create the menu
        const disposeMenu = this.createMenu(plane, node)
        
        let hasDisposed = false
        function dispose(){
            if(hasDisposed) return
            hasDisposed = true
            disposeMenu()
            node.onMove.remove(o)
            plane.dispose()
            node.onDispose.removeCallback(dispose)
            that.showns.delete(node)
        }
        node.onDispose.addOnce(dispose)

        // Dispose when pointers are out
        setTimeout(function fn(){
            if(hasDisposed) return
            let pointed = false
            for(const [controller,_] of that.targets.controllerToTarget){
                const pt = controller.pointer
                const ray = new Ray(pt.origin, pt.forward)
                if(ray.intersectsMesh(collisionPlane, true).hit) pointed = true
            }
            if(!pointed) dispose()
            setTimeout(fn, 50)
        },50)


        return dispose
    }

    /**
     * Create the bar menu.
     * The menu should :
     * - be a child of "base"
     * - forward is +z
     * - up is +y
     * - right is +x
     * - The node is positioned in a cube of size 1, centered at 0
     * @param base The base transform node to which the menu will be attached. The menu will be a child of this node.
     * @param node The node for which the menu is being created.
     * @return A function that, when called, will dispose of the menu and clean up any resources associated with it.
     */
    private createMenu(base: TransformNode, node: Node3DInstance): ()=>void{
        // Simple block menu
        const menu_info = this.createMenuConfig(node)
        const menu = new BlocksMenu(this.scenes.getScene(), this.scenes.getUtilityScene(), menu_info)
        menu.root.parent = base
        menu.root.resetLocalMatrix()
        menu.root.position.set(0, .5+menu.plane.scaling.y/2, 0)

        return ()=>{
            menu.dispose()
        }
    }

    /**
     * Create the simple block menu config.
     */
    private createMenuConfig(node: Node3DInstance): BMenuMenu {
        return {
            width: 20,
            items: [
                { height:2, width: 10, text: node.factory.label },
                { height:2, width: 2 },
                { height:2, width: 2, text: "⚙", color: "#aaaaaa", onClick: ()=>{
                    this.context.openNodeMenu(node)
                } },
                { height:2, width: 1 },
                { height:2, width: 2, text: "📄", color: "#ffffaa", onClick: async()=>{
                    const serialized = Serialization.getInstance().save([node], false)
                    const clone = await Serialization.getInstance().load(serialized)
                    for(const node of clone){
                        node.boundingBoxMesh.position.addInPlaceFromFloats(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5)
                        node.updatePosition()
                    }
                } },
                { height:2, width: 1 },
                { height:2, width: 2, text: "X", color: "#d27f7f", onClick: ()=>{
                    node.dispose()
                }},
            ]
        }
    }

}

