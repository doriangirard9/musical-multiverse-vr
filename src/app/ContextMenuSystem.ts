import { Color3 } from "@babylonjs/core";
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
import { BlocksMenu, BMenuBlock } from "../menus/BlocksMenu";


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
    private menu: BlocksMenu|null = null

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
        this.menu = new BlocksMenu(utility.originalScene, utility.utilityLayerScene)

        function openRemoveConnections(){
            const conns = target.connections
            
            // Connections
            const items: BMenuBlock[] = []
            for (const c of conns) {
                const text = N3DLabel.connection(c, target)
                items.push({ text, color: "#ffcc55", width:6, onClick: () => {
                    c.remove()
                    that.closeMenu()
                }})
            }

            that.menu!.set({
                width: 6,
                items: [
                    { text: "Pick a connection to delete:", width:6 },
                    { sub: { width: 6, items }, width:6, height:6 },
                    { text: "← Back", color: "#aaaaaa", onClick: () => openMenu(), width:6  }
                ]
            })
        }

        function openMenu(){
            // Node Deletion Menu
            let deleteMenu: BMenuBlock[] = [
                { text: "🗑 Delete the node", color: "#ff6666", width: 6, onClick: async()=>{
                    target.dispose()
                    that.closeMenu()
                }},

                { text: "↔ Delete a connection", color: "#ff6666", width: 6, onClick: async()=>{
                        openRemoveConnections()
                }},

                { text: "↔ Delete ALL connections", color: "#ff6666", width: 6, onClick: async()=>{
                        const conns = target.connections
                        for (const c of conns) c.remove()
                        that.closeMenu()
                }},
            ]

            // Copy Menu
            let copyMenu: BMenuBlock[] = [
                { text: "📄 Clone", color: "#ffffaa", width: 6, onClick: async()=>{
                    if(!target) return
                    const serialized = Serialization.getInstance().save([target], false)
                    const clone = await Serialization.getInstance().load(serialized)
                    for(const node of clone){
                        node.boundingBoxMesh.position.addInPlaceFromFloats(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5)
                        node.updatePosition()
                    }
                }},

                { text: "📋 Copy Node", color: "#ffffaa", width: 6, onClick: async()=>{
                    if(!target) return
                    const serialized = Serialization.getInstance().save([target], false)
                    const head = that.inputs.head.matrix.asArray()
                    await navigator.clipboard.writeText(JSON.stringify({serialized,head}))
                }},

                { text: "📋 Copy Structure", color: "#ffffaa", width: 6, onClick: async()=>{
                    if(!target) return
                    const serialized = Serialization.getInstance().save([target], true)
                    const head = that.inputs.head.matrix.asArray()
                    await navigator.clipboard.writeText(JSON.stringify({serialized,head}))
                }},
            ]

            // Parameters Menu
            let parametersMenu: BMenuBlock[] = [                
                { text: "📄 Copy Parameters", color: "#70e7ff", width: 6, onClick: async()=>{
                    if(!target) return
                    const parameters = [...target.parameters.entries()]
                        .map(([k,p])=>[k, p.getValue()])
                    await navigator.clipboard.writeText(JSON.stringify(Object.fromEntries(parameters)))
                }},

                { text: "📋 Paste Parameters", color: "#70e7ff", width: 6, onClick: async()=>{
                    if(!target) return
                    const text = await navigator.clipboard.readText()
                    try{
                        const json = JSON.parse(text)
                        for(const [k,v] of Object.entries(json))
                            if(target.parameters.has(k))
                                if(typeof v == "number")
                                    target.parameters.get(k)?.setValue(v)
                    }catch(e){}
                }},

                { text: "Randomize", color: "#70e7ff", width: 6 },
                {},
                { text: "🎲100%", color: "#70e7ff", width: 1, onClick:  async()=>{
                    if(!target) return
                    for(const p of target.parameters.values()){
                        const stepcount = p.config.getStepCount() || 1000
                        let v = Math.random()
                        v = v - v % (1/stepcount)
                        if(v < 0) v = 0
                        if(v > 1) v = 1
                        p.setValue(v)
                    }
                }},
                { text: "🧬20%", color: "#70e7ff", onClick: async()=>{
                    if(!target) return
                    for(const p of target.parameters.values()){
                        const stepcount = p.config.getStepCount() || 1000
                        let step = Math.max(.2,2/stepcount)
                        let v = p.getValue() + (Math.random()-0.5)*2*step
                        v = v - v % (1/stepcount)
                        if(v < 0) v = 0
                        if(v > 1) v = 1
                        p.setValue(v)
                    }
                }},
                { text: "🧬10%", color: "#70e7ff", onClick: async()=>{
                    if(!target) return
                    for(const p of target.parameters.values()){
                        const stepcount = p.config.getStepCount() || 1000
                        let step = Math.max(.1,2/stepcount)
                        let v = p.getValue() + (Math.random()-0.5)*2*step
                        v = v - v % (1/stepcount)
                        if(v < 0) v = 0
                        if(v > 1) v = 1
                        p.setValue(v)
                    }
                }},
                { text: "🧬5%", color: "#70e7ff", onClick: async()=>{
                    if(!target) return
                    for(const p of target.parameters.values()){
                        const stepcount = p.config.getStepCount() || 1000
                        let step = Math.max(.05,2/stepcount)
                        let v = p.getValue() + (Math.random()-0.5)*2*step
                        v = v - v % (1/stepcount)
                        if(v < 0) v = 0
                        if(v > 1) v = 1
                        p.setValue(v)
                    }
                }},
            ]

            that.menu!.set({
                width: 6,
                items: [
                    { text: N3DLabel.node(target), color: "#ffffff", width: 5 },
                    { text: "X", color: "#ff6666", width: 1, onClick: async()=> that.closeMenu()},
                    {
                        height: 9,
                        width: 6,
                        sub:{
                            width: 6,
                            items:[
                                ...deleteMenu,
                                ...copyMenu,
                                ...parametersMenu
                            ]
                        }
                    }
                ]
            })
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
        this.menu = new BlocksMenu(utility.originalScene, utility.utilityLayerScene)


        function openMenu(){
            const nodes: Node3DInstance[] = []
            if(target.inputConnectable?.instance) nodes.push(target.inputConnectable.instance)
            if(target.outputConnectable?.instance) nodes.push(target.outputConnectable.instance)

            that.menu!.set({
                width: 6,
                items: [
                    { text: N3DLabel.connection(target), width:6},

                    { text: "🗑↔ Delete", color: "#ff6666", width:6, onClick: async()=>{
                        target.dispose()
                        that.closeMenu()
                    }},

                    { text: "---"},
                    
                    { text: "📋 Copy Structure", color: "#ffffaa", width:6, onClick: async()=>{
                        if(nodes.length==0) return
                        const serialized = Serialization.getInstance().save(nodes, true)
                        const head = that.inputs.head.matrix.asArray()
                        await navigator.clipboard.writeText(JSON.stringify({serialized,head}))
                    }},
                ]
            })
        }    

        openMenu()

        // Show menu
        this.menu.onHide.addOnce(()=>{
            this.closeMenu()
        })
        this.menus.open(this.menu, false)
    }


}