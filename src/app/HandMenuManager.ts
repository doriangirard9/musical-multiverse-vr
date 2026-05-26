import { InputManager } from "../xr/inputs/InputManager"
import { SceneManager } from "./SceneManager"
import { MenuButton, MenuPanel } from "../world/menu/MenuPanel"
import { WamTransportManager } from "./WamTransportManager"
import { DrawingManager } from "./DrawingManager"
import { Node3dManager } from "./Node3dManager"
import { ShopMenuManager } from "./ShopMenuManager"
import { Node3DInstance } from "../node3d/instance/Node3DInstance"
import { Serialization } from "./Serialization"
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core"
import { QuaternionUtils } from "../utils/quaternion"


/**
 * Manager responsible of the left hand menu.
 */
export class HandMenuManager {

    // Instance
    static _instance?: HandMenuManager

    static async initialize(...network: ConstructorParameters<typeof HandMenuManager>){
        this._instance = await new HandMenuManager(...network).initialize()
    }

    static getInstance(): HandMenuManager {
        if(!this._instance) throw new Error("HandMenuManager not initialized. Call initialize() first.")
        return this._instance
    }

    // Target
    private _targetNodeInstance?: {key:string, node:Node3DInstance}

    private registerTargetSelection(){
        this.pointer.onNewTarget.add(()=>{

            // Find the targeted
            const pointed = this.pointer.targetMesh

            let found: {key:string, node:Node3DInstance}|undefined
            for(const [key,node] of this.nodeManager.getRegistry().nodes.entries()){
                if(node.boundingBoxMesh==pointed){
                    found = {key, node}
                    break
                }
            }

            // Update target
            if(!!found != !!this._targetNodeInstance){
                console.log("Target changed :", found?.node?.boundingBoxMesh?.name, " (", found?.key, ")")
                this._targetNodeInstance = found
                this.updateMenu()
            }
            else this._targetNodeInstance = found
        })
    }

    // Menu
    public menu!: MenuPanel

    public pointer

    constructor(
        readonly scene: SceneManager,
        readonly inputs: InputManager,
        readonly wamTransport: WamTransportManager,
        readonly nodeManager: Node3dManager,
        readonly shopMenu: ShopMenuManager
    ){
        this.pointer = inputs.left.pointer
    }

    async initialize(){

        this.menu = new MenuPanel(
            this.scene.getScene(),
            SceneManager.getInstance().getUtilityLayer().utilityLayerScene,
            []
        )

        this.menu.followPointer(this.pointer)
        this.menu.show()
        
        this.updateMenu()

        this.registerTargetSelection()

        return this
    }

    updateMenu(){
        const buttons = [] as MenuButton[]

        // Play/Stop
        if(this.wamTransport.isPlaying) buttons.push({ label: "⏸ Stop", color: "#FF6666", onClick: ()=>{
            this.wamTransport.stop()
            this.updateMenu()
        }})
        else buttons.push({ label: "▶ Play", color: "#66ff66", onClick: ()=>{
            this.wamTransport.start()
            this.updateMenu()
        }})

        // Draw
        buttons.push({ label: "✏️ Draw from clipboard", color: "#66ccff", onClick: async()=>{
            const path = await navigator.clipboard.readText()
            DrawingManager.getInstance().drawFromSvg(
                path,
                20,
                this.pointer.origin,
                this.pointer.up,
                this.pointer.right,
            ) 
        }})

        // Open shop menu
        buttons.push({ label: "🛒 Open/Close shop menu", color: "#ffcc66", onClick: async()=>{
            this.shopMenu.toggle()
        }})

        if(this._targetNodeInstance){

            // Delete pointed object
            buttons.push({ label: "🗑 Delete pointed node", color: "#ff6666", onClick: async()=>{
                this._targetNodeInstance?.node.dispose()
            }})

            // Clone
            buttons.push({ label: "📄 Clone pointed node", color: "#66ff66", onClick: async()=>{
                if(!this._targetNodeInstance) return
                const serialized = Serialization.getInstance().save([this._targetNodeInstance.node], false)
                const clone = await Serialization.getInstance().load(serialized)
                for(const node of clone){
                    node.boundingBoxMesh.position.addInPlaceFromFloats(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5)
                    node.updatePosition()
                }
            }})

            // Copy
            buttons.push({ label: "📋 Copy Structure", color: "#66ccff", onClick: async()=>{
                if(!this._targetNodeInstance) return
                const serialized = Serialization.getInstance().save([this._targetNodeInstance.node], false)
                const head = this.inputs.head.matrix.asArray()
                await navigator.clipboard.writeText(JSON.stringify({serialized,head}))
            }})
            
        }

        // Paste
        buttons.push({ label: "📋 Paste Structure", color: "#6691ff", onClick: async()=>{
            const text = await navigator.clipboard.readText()
            let parsed: {serialized: any, head: number[]}|undefined = JSON.parse(text)
            console.log(parsed)

            if(!parsed?.head || !parsed?.serialized) return
            let old_head = Matrix.FromArray(parsed!!.head)

            const transformation = old_head.invert().multiply(this.inputs.head.matrix)
            
            console.log(parsed.serialized)
            let nodes = await Serialization.getInstance().load(parsed.serialized)
            for(const node of nodes){
                node.boundingBoxMesh.setAbsolutePosition(Vector3.TransformCoordinates(node.boundingBoxMesh.absolutePosition,transformation))
                QuaternionUtils.setAbsolute(node.boundingBoxMesh,Quaternion.FromRotationMatrix(transformation.getRotationMatrix()).multiply(QuaternionUtils.getAbsolute(node.boundingBoxMesh)))
                node.updatePosition()
            }

        }})

        this.menu.set(buttons)
    }


}