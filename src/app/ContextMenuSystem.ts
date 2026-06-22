import { Color3 } from "@babylonjs/core";
import { ChoiceMenu, MenuButton as ChoiceMenuButton } from "../menus/ChoiceMenu";
import { Node3DInstance } from "../node3d/instance/Node3DInstance";
import { BoxHighlight } from "../world/BoxHighlight";
import { InputManager } from "../xr/inputs/InputManager";
import { MenuSystem } from "./MenuSystem";
import { Node3dManager } from "./Node3dManager";
import { SceneManager } from "./SceneManager";
import { TargetManager } from "./TargetManager";
import { WamTransportManager } from "./WamTransportManager";
import { Serialization } from "./Serialization";
import { N3DLabel } from "../node3d/instance/utils/N3DLabel";
import { N3DConnectionInstance } from "../node3d/instance/N3DConnectionInstance";


/**
 * The ContextMenuSystem class manages context menus for 3D nodes in the scene.
 * It allows users to open a context menu for a selected node, providing options
 * such as deleting the node. The system highlights the selected node and ensures
 * that only one context menu is open at a time.
 */
export class ContextMenuSystem {

    // Instance
    static _instance?: ContextMenuSystem

    static async initialize(...network: ConstructorParameters<typeof ContextMenuSystem>){
        this._instance = await new ContextMenuSystem(...network)
    }

    static getInstance(): ContextMenuSystem {
        if(!this._instance) throw new Error("ContextMenuSystem not initialized. Call initialize() first.")
        return this._instance
    }


    constructor(
        readonly scene: SceneManager,
        readonly inputs: InputManager,
        readonly wamTransport: WamTransportManager,
        readonly nodeManager: Node3dManager,
        readonly targets: TargetManager,
        readonly menus: MenuSystem
    ){
        this.highlight = new BoxHighlight(scene.getScene(), Color3.Red())

        inputs.y_button.onDown.add(()=>{
            for(const pt of [targets.screen, targets.left]){
                if(pt.target.node){
                    this.openNodeMenu(pt.target.node)
                    return
                }
                if(pt.target.connection){
                    this.openConnectionMenu(pt.target.connection)
                    return
                }
            }
            if(this.menu && this.menus.current_menu==this.menu){
                this.menus.close()
            }
        })
    }

    private nodeTarget: Node3DInstance|null = null
    private connectionTarget: N3DConnectionInstance|null = null
    private highlight!: BoxHighlight
    private menu: ChoiceMenu|null = null

    closeMenu(){
        if(this.nodeTarget){
            this.nodeTarget.boundingBoxMesh.removeBehavior(this.highlight)
            this.nodeTarget = null
        }
        if(this.connectionTarget){
            this.connectionTarget.tube.removeBehavior(this.highlight)
            this.connectionTarget = null
        }
        if(this.menu){
            if(this.menus.current_menu==this.menu) this.menus.close()
            this.menu = null
        }
    }

    openNodeMenu(target: Node3DInstance){
        const that = this

        this.closeMenu()

        // Highlight
        this.nodeTarget = target
        this.nodeTarget.boundingBoxMesh.addBehavior(this.highlight)

        // Menu
        const utility = this.scene.getUtilityLayer()
        this.menu = new ChoiceMenu(utility.originalScene, utility.utilityLayerScene, [])

        function openRemoveConnections(){
            const conns = target.connections
            const choices: { label: string; color?: string; click?: () => void }[] = [
                { label: "Pick a connection to delete:", color: "#ffffff" },
            ]
            for (const c of conns) {
                const label = N3DLabel.connection(c, target)
                choices.push({ label, color: "#ffcc55", click: () => {
                    c.remove()
                    that.closeMenu()
                } })
            }
            choices.push({ label: "← Back", color: "#aaaaaa", click: () => openMenu() })
            that.menu!.set(choices)
        }

        function openMenu(){
            that.menu!.set([
                { label: N3DLabel.node(target), color: "#ffffff"},

                { label: "🗑● Delete", color: "#ff6666", click: async()=>{
                    target.dispose()
                    that.closeMenu()
                }},

                { label: "🗑↔ Delete a connection", color: "#ff6666", click: async()=>{
                    openRemoveConnections()
                }},

                { label: "🗑↔ Delete ALL connections", color: "#ff6666", click: async()=>{
                    const conns = target.connections
                    for (const c of conns) c.remove()
                    that.closeMenu()
                }},

                { label: "---"},

                { label: "📄 Clone", color: "#ffffaa", click: async()=>{
                    if(!target) return
                    const serialized = Serialization.getInstance().save([target], false)
                    const clone = await Serialization.getInstance().load(serialized)
                    for(const node of clone){
                        node.boundingBoxMesh.position.addInPlaceFromFloats(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5)
                        node.updatePosition()
                    }
                }},
                
                { label: "📋 Copy Structure", color: "#ffffaa", click: async()=>{
                    if(!target) return
                    const serialized = Serialization.getInstance().save([target], true)
                    const head = that.inputs.head.matrix.asArray()
                    await navigator.clipboard.writeText(JSON.stringify({serialized,head}))
                }},
            ])
        }    

        openMenu()

        // Show menu
        this.menu.onHide.addOnce(()=>{
            this.closeMenu()
        })
        this.menus.open(this.menu, false)
    }

    openConnectionMenu(target: N3DConnectionInstance){
        const that = this

        this.closeMenu()

        // Highlight
        this.connectionTarget = target
        this.connectionTarget.tube.addBehavior(this.highlight)

        // Menu
        const utility = this.scene.getUtilityLayer()
        this.menu = new ChoiceMenu(utility.originalScene, utility.utilityLayerScene, [])


        function openMenu(){
            const nodes: Node3DInstance[] = []
            if(target.inputConnectable?.instance) nodes.push(target.inputConnectable.instance)
            if(target.outputConnectable?.instance) nodes.push(target.outputConnectable.instance)

            that.menu!.set([
                { label: N3DLabel.connection(target), color: "#ffffff"},

                { label: "🗑↔ Delete", color: "#ff6666", click: async()=>{
                    target.dispose()
                    that.closeMenu()
                }},

                { label: "---"},
                
                { label: "📋 Copy Structure", color: "#ffffaa", click: async()=>{
                    if(nodes.length==0) return
                    const serialized = Serialization.getInstance().save(nodes, true)
                    const head = that.inputs.head.matrix.asArray()
                    await navigator.clipboard.writeText(JSON.stringify({serialized,head}))
                }},
            ])
        }    

        openMenu()

        // Show menu
        this.menu.onHide.addOnce(()=>{
            this.closeMenu()
        })
        this.menus.open(this.menu, false)
    }


}