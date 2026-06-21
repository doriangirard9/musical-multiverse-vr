import { InputManager } from "../xr/inputs/InputManager"
import { SceneManager } from "./SceneManager"
import { WamTransportManager } from "./WamTransportManager"
import { DrawingSystem } from "./DrawingSystem"
import { Node3dManager } from "./Node3dManager"
import { ShopMenuSystem } from "./ShopMenuSystem"
import { Serialization } from "./Serialization"
import { AbstractMesh, Color3, Matrix, Quaternion, Vector3 } from "@babylonjs/core"
import { QuaternionUtils } from "../utils/quaternion"
import { TargetManager } from "./TargetManager"
import { BoxHighlight } from "../world/BoxHighlight"
import { PointerVisualSystem } from "./PointerVisualSystem"
import { ChoiceMenu, MenuButton as ChoiceMenuButton } from "../menus/ChoiceMenu"
import { NoteUtils } from "../node3d/tools";
import { ROUTES, buildHash } from "../router/routes"


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
    public selector
    public pointerVisual
    private selectionColor

    constructor(
        readonly scene: SceneManager,
        readonly inputs: InputManager,
        readonly wamTransport: WamTransportManager,
        readonly nodeManager: Node3dManager,
        readonly shopMenu: ShopMenuSystem,
        readonly targets: TargetManager,
        pointerVisualSystem: PointerVisualSystem,
    ){
        // Settings
        this.selectionColor = Color3.Green()
            
        // Pointer and selector
        this.pointer = inputs.left.pointer
        this.pointerVisual = pointerVisualSystem.pointerToVisual.get(this.pointer)!
        this.selector = targets.controllerToTarget.get(this.pointer.controller)!
        this.selector.onNewTarget.add(()=>{
            this.updateMenu()
            this.highlightTarget = this.selector.target.node?.boundingBoxMesh
                ?? this.selector.target.connection?.tube
                ?? null
            this.updateHighlight()
        })

        // Hand Menu
        this.menu = new ChoiceMenu(
            this.scene.getScene(),
            SceneManager.getInstance().getUtilityLayer().utilityLayerScene,
            []
        )
        
        this.menu.followPointer(this.pointer,{
            onShow: this.onShow.bind(this),
            onHide: this.onHide.bind(this),
        })
        this.menu.show()

        // Transport
        this.transportMenu = new TransportMenu(this.scene, this.wamTransport)

        wamTransport.onChange(() => {
            this.updateMenu()
        })

        // Highlight
        this.initHighlight()

        this.updateMenu()
    }

    updateMenu(){
        const target = this.selector.target

        const buttons = [] as ChoiceMenuButton[]

        // Play/Stop
        if(this.wamTransport.isPlaying) buttons.push({ label: "⏸ Stop", color: "#FF6666", click: ()=>{
            this.wamTransport.stop()
        }})
        else buttons.push({ label: "▶ Play", color: "#66ff66", click: ()=>{
            this.wamTransport.start()
        }})

        buttons.push({ label: `⚙ Open/Close settings`, color: "#66ccff", click: ()=>{
            this.shopMenu.menus.toggle(this.transportMenu.menu, false)
        }})

        buttons.push({ label: "↩ Leave session", color: "#ff9966", click: ()=>{
            window.location.hash = buildHash(ROUTES.SESSIONS)
        }})

        // Open shop menu
        buttons.push({ label: "🛒 Open/Close shop menu", color: "#ffcc66", click: async()=>{
            this.shopMenu.toggle()
        }})

        if(target.node){

            buttons.push({ label: `On ${this.pointer.controller.side} pointed :`, color: "#ffffff"})

            // Delete pointed object
            buttons.push({ label: "🗑 Delete node", color: "#ff6666", click: async()=>{
                if(target.node==null) return
                target.node.dispose()
            }})

            // Clone
            buttons.push({ label: "📄 Clone pointed node", color: "#66ff66", click: async()=>{
                if(!target.node) return
                const serialized = Serialization.getInstance().save([target.node], false)
                const clone = await Serialization.getInstance().load(serialized)
                for(const node of clone){
                    node.boundingBoxMesh.position.addInPlaceFromFloats(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5)
                    node.updatePosition()
                }
            }})

            // Copy
            buttons.push({ label: "📋 Copy Structure", color: "#66ccff", click: async()=>{
                if(!target.node) return
                const serialized = Serialization.getInstance().save([target.node], true)
                const head = this.inputs.head.matrix.asArray()
                await navigator.clipboard.writeText(JSON.stringify({serialized,head}))
            }})
            
        }

        if(target.connection){

            buttons.push({ label: `On ${this.pointer.controller.side} pointed :`, color: "#ffffff"})

            // Delete pointed object
            buttons.push({ label: "🗑 Delete connection", color: "#ff6666", click: async()=>{
                if(target.connection==null) return
                target.connection.dispose()
            }})
        }

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

    onShow(){
        this.isHighlightVisible = true
        this.updateHighlight()
        this.pointerVisual.addColor(this.selectionColor)
    }

    onHide(){
        this.isHighlightVisible = false
        this.updateHighlight()
        this.pointerVisual.removeColor(this.selectionColor)
    }

    // Highlight
    private highlight!: BoxHighlight
    
    private initHighlight(){
        this.highlight = new BoxHighlight(this.scene.getScene(), this.selectionColor)
    }

    private highlightTarget: AbstractMesh|null = null
    private isHighlightVisible = false

    private updateHighlight(){
        const toHighlight = this.isHighlightVisible ? this.highlightTarget : null
        if(toHighlight!=this.highlight.attachedNode){
            if(this.highlight.attachedNode!=null){
                this.highlight.attachedNode.removeBehavior(this.highlight)
            }
            if(toHighlight) toHighlight.addBehavior(this.highlight)
        }
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
        this.menu = new ChoiceMenu(scenes.getScene(), scenes.getUtilityLayer().utilityLayerScene, [])
        this.menu.hide()
        this.updateMenu()

        transport.onChange(() => {
            this.updateMenu()
        })
    }

    updateMenu(){
        const buttons = [] as ChoiceMenuButton[]
        
        // Play/Stop
        if(this.transport.isPlaying) buttons.push({ label: "⏸ Stop", color: "#FF6666", click: ()=>{
            this.transport.stop()
        }})
        else buttons.push({ label: "▶ Play", color: "#66ff66", click: ()=>{
            this.transport.start()
        }})

        // Tempo
        buttons.push({ label: `Tempo : ${this.transport.getTempo()} BPM`, color: "#bbffff"})
        buttons.push({ label: "+", color: "#bbffff", click: ()=>{
            this.transport.setTempo(Math.min(300, this.transport.getTempo()+5))
        }})
        buttons.push({ label: "-", color: "#bbffff", click: ()=>{
            this.transport.setTempo(Math.max(0,this.transport.getTempo()-5))
        }})

        // Time signature
        const ts = this.transport.getTimeSignature()
        buttons.push({ label: `Time Signature : ${ts.numerator}/${ts.denominator}`, color: "#ffffbb"})
        buttons.push({ label: "+", color: "#ffffbb", click: ()=>{
            this.transport.setTimeSignature(ts.numerator+1, ts.denominator)
        }})
        buttons.push({ label: "-", color: "#ffffbb", click: ()=>{
            this.transport.setTimeSignature(Math.max(1, ts.numerator-1), ts.denominator)
        }})

        // Gamme
        const notes = NoteUtils
        buttons.push({ label: notes.getSelectedGamme().label, color: "#d982c6", click: ()=>{
            notes.setSelectedGammeIndex(notes.getSelectedGammeIndex()+1)
            this.updateMenu()
        }})


        this.menu.set(buttons)
    }
}