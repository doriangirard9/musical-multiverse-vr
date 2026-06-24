import { InputManager } from "../xr/inputs/InputManager"
import { SceneManager } from "./SceneManager"
import { WamTransportManager } from "./WamTransportManager"
import { DrawingSystem } from "./DrawingSystem"
import { Node3dManager } from "./Node3dManager"
import { ShopMenuSystem } from "./ShopMenuSystem"
import { Serialization } from "./Serialization"
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core"
import { QuaternionUtils } from "../utils/quaternion"
import { ChoiceMenu, MenuButton as ChoiceMenuButton } from "../menus/ChoiceMenu"
import { NoteUtils } from "../node3d/tools";
import { ROUTES, buildHash } from "../router/routes"
import { BlocksMenu, BMenuBlock } from "../menus/BlocksMenu"


/**
 * A menu attached to the left hand. 
 * Allowing the user to interact with the pointed object
 * and with the application in general (play/stop, open shop menu, etc.).
 */
export class HandMenuSystem {

    // Instance
    static _instance?: HandMenuSystem

    static async initialize(...network: ConstructorParameters<typeof HandMenuSystem>){
        this._instance = await new HandMenuSystem(...network)
    }

    static getInstance(): HandMenuSystem {
        if(!this._instance) throw new Error("HandMenuManager not initialized. Call initialize() first.")
        return this._instance
    }

    // Menu
    public menu!: ChoiceMenu
    private transportMenu!: TransportMenu

    public pointer

    constructor(
        readonly scene: SceneManager,
        readonly inputs: InputManager,
        readonly wamTransport: WamTransportManager,
        readonly nodeManager: Node3dManager,
        readonly shopMenu: ShopMenuSystem,
    ){            
        // Pointer and selector
        this.pointer = inputs.left.pointer

        // Hand Menu
        this.menu = new ChoiceMenu(
            this.scene.getScene(),
            SceneManager.getInstance().getUtilityLayer().utilityLayerScene,
            []
        )
        
        this.menu.followPointer(this.pointer,{})
        this.menu.show()

        // Transport
        this.transportMenu = new TransportMenu(this.scene, this.wamTransport)

        wamTransport.onChange(() => {
            this.updateMenu()
        })

        this.updateMenu()
    }

    updateMenu(){
        const buttons = [] as ChoiceMenuButton[]

        // Play/Stop
        if(this.wamTransport.isPlaying) buttons.push({ label: "⏸ Stop", color: "#FF6666", click: ()=>{
            this.wamTransport.stop()
        }})
        else buttons.push({ label: "▶ Play", color: "#66ff66", click: ()=>{
            this.wamTransport.start()
        }})

        // Settings
        buttons.push({ label: `⚙ Open/Close settings`, color: "#66ccff", click: ()=>{
            this.shopMenu.menus.toggle(this.transportMenu.menu, false)
        }})

        // Shop
        buttons.push({ label: "🛒 Open/Close shop menu", color: "#ffcc66", click: async()=>{
            this.shopMenu.toggle()
        }})

        // Leave session
        buttons.push({ label: "↩ Leave session", color: "#ff9966", click: ()=>{
            window.location.hash = buildHash(ROUTES.SESSIONS)
        }})

        buttons.push({ label: `---`, color: "#ffffff"})

        // Paste
        buttons.push({ label: "📋 Paste Structure", color: "#6691ff", click: async()=>{
            const text = await navigator.clipboard.readText()
            let parsed: {serialized: any, head: number[]}|undefined = JSON.parse(text)

            if(!parsed?.head || !parsed?.serialized) return
            let old_head = Matrix.FromArray(parsed!!.head)

            const transformation = old_head.invert().multiply(this.inputs.head.matrix)
            
            let nodes = await Serialization.getInstance().load(parsed.serialized)
            for(const node of nodes){
                node.boundingBoxMesh.setAbsolutePosition(Vector3.TransformCoordinates(node.boundingBoxMesh.absolutePosition,transformation))
                QuaternionUtils.setAbsolute(node.boundingBoxMesh,Quaternion.FromRotationMatrix(transformation.getRotationMatrix()).multiply(QuaternionUtils.getAbsolute(node.boundingBoxMesh)))
                node.updatePosition()
            }

        }})

        // Draw
        buttons.push({ label: "✏️ Draw from clipboard path", color: "#66ccff", click: async()=>{
            const path = await navigator.clipboard.readText()
            DrawingSystem.getInstance().drawFromSvg(
                path,
                20,
                this.pointer.origin,
                this.pointer.up,
                this.pointer.right,
            ) 
        }})

        this.menu.set(buttons)
    }

}

/**
 * A menu to control the WAM transport (play/stop, tempo, time signature).
 */
class TransportMenu{

    menu

    constructor(
        scenes: SceneManager,
        private transport: WamTransportManager,
    ){
        this.menu = new BlocksMenu(scenes.getScene(), scenes.getUtilityLayer().utilityLayerScene)
        this.menu.hide()
        this.updateMenu()

        transport.onChange(() => {
            this.updateMenu()
        })
    }

    updateMenu(){
        const items = [] as BMenuBlock[]
        
        // Play/Stop
        if(this.transport.isPlaying) items.push(
            { text: "▶", width:2, height: 2 },
            {
                text: "Stop",
                color: "#FF6666",
                onClick: () => this.transport.stop(),
                width:4, height: 2
            }
        )
        else items.push(
            { text: "⏸", width:2, height: 2 },
            {
                text: "Play",
                color: "#66ff66",
                onClick: () => this.transport.start(),
                width:4, height: 2
            }
        )

        // Tempo
        items.push({
            text: `Tempo : ${this.transport.getTempo()} BPM`,
            color: "#bbffff",
            width:5, height: 2
        })
        items.push({
            text: "+", color: "#bbffff",
            onClick: () => this.transport.setTempo(Math.min(300, this.transport.getTempo()+5)),
            width:1, height: 1
        })
        items.push({
            text: "-", color: "#bbffff",
            onClick: () => this.transport.setTempo(Math.max(0,this.transport.getTempo()-5)),
            width:1, height: 1
        })

        // Time signature
        const ts = this.transport.getTimeSignature()
        items.push({
            text: `Time Signature : ${ts.numerator}/${ts.denominator}`,
            color: "#ffffbb",
            width:5, height: 2
        })
        items.push({
            text: "+", color: "#ffffbb",
            onClick: () => this.transport.setTimeSignature(ts.numerator+1, ts.denominator),
            width:1, height: 1
        })
        items.push({
            text: "-", color: "#ffffbb",
            onClick: () => this.transport.setTimeSignature(Math.max(1, ts.numerator-1), ts.denominator),
            width:1, height: 1
        })

        // Gamme
        const notes = NoteUtils
        items.push({
            text: notes.getSelectedGamme().label, color: "#d982c6",
            width:5, height: 2
        })

        items.push({
            text: "˄", color: "#d982c6",
            onClick: () => {
                const index = (notes.getSelectedGammeIndex()+1) % notes.GAMMES.length
                notes.setSelectedGammeIndex(index)
                this.updateMenu()
            },
            width:1, height: 1
        })
        items.push({
            text: "˅", color: "#d982c6",
            onClick: () => {
                const index = (notes.getSelectedGammeIndex()-1+notes.GAMMES.length) % notes.GAMMES.length
                notes.setSelectedGammeIndex(index)
                this.updateMenu()
            },
            width:1, height: 1
        })


        this.menu.set({ width: 6, items })
    }
}