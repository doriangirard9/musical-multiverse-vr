import { AbstractMesh, TransformNode, Vector3 } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { Tool } from "../../../tool/Tool";
import type { ToolContext } from "../../../tool/ToolContext";
import type { ToolKind } from "../../../tool/ToolKind";
import type { ControllerInput } from "../../../xr/inputs/ControllerInput";
import type { MidiN3DConnectable } from "../../tools";
import THUMBNAIL_URL from "../../../tool/subs/wand/thumbnail.png?url"

const MARACAS_URL = (await import("./maracas.glb?url")).default

/** Print who takes the maraca and who puts it back, to find what removes it from the hand. */
const DEBUG = true

/** Where each maraca rests on the base, one on each side. */
const REST_X = .25

/** The speed of the hand under which a reversal of direction is tremor, not a shake, in m/s. */
const MIN_SHAKE_SPEED = .4

/** The speed of the hand giving the highest note, in m/s. Faster gives the same note. */
const MAX_SHAKE_SPEED = 4

/** The lowest and highest notes a shake can give. */
const LOW_NOTE = 36
const HIGH_NOTE = 96

/** How long a note lasts, in seconds. */
const NOTE_DURATION = .2

/** How much a held maraca leans forward from the vertical, in radians. */
const HELD_TILT = Math.PI / 3



export class HandMaracasN3DGUI implements Node3DGUI{

    root

    base!: AbstractMesh

    /** The two maracas, left one first. */
    maracas!: MaracaGUI[]

    get worldSize(){ return 1 }

    constructor(){
        this.root = new TransformNode("hand maracas root")
    }

    async init(context: Node3DGUIContext){
        const {babylon:B} = context

        this.base = B.CreateBox("hand maracas base", {size:1,height:.2}, context.scene)
        this.base.parent = this.root
        this.base.position.set(0,-.4,0)

        this.maracas = await Promise.all([-REST_X, REST_X].map(x => MaracaGUI.create(context, this.root, x)))
    }

    async dispose(){ }
}

/** The meshes of one maraca: its rest on the base, the model, and its output. */
class MaracaGUI {

    private constructor(
        /** Where the maraca sits when nobody holds it. */
        readonly rest: TransformNode,
        /** The node carrying the model, moved from the rest to a hand and back. */
        readonly holder: TransformNode,
        readonly model: AbstractMesh,
        readonly output: AbstractMesh,
    ){}

    static async create(context: Node3DGUIContext, root: TransformNode, x: number): Promise<MaracaGUI> {
        const {babylon:B, tools:T, scene} = context
        const side = x < 0 ? "left" : "right"

        const rest = new TransformNode(`maraca ${side} rest`, scene)
        rest.parent = root
        rest.position.set(x, .2, 0)

        const holder = new TransformNode(`maraca ${side} holder`, scene)
        holder.parent = rest

        const model = await B.ImportMeshAsync(MARACAS_URL, scene).then(it => it.meshes[0])
        model.parent = holder

        const output = T.ConnectableUtils.createOutputMesh(`maraca ${side} output`, .5, scene)
        T.MeshUtils.setColor(output, T.MidiN3DConnectable.Color.toColor4())
        output.parent = root
        output.position.set(x * 2.4, -.4, 0)

        return new MaracaGUI(rest, holder, model, output)
    }

    /** Is this mesh part of the model? */
    holds(mesh: AbstractMesh|null): boolean {
        return mesh !== null && (mesh === this.model || mesh.isDescendantOf(this.holder))
    }

}



export class HandMaracasN3D implements Node3D{

    readonly maracas: Maraca[]

    constructor(context: Node3DContext, gui: HandMaracasN3DGUI){
        context.addToBoundingBox(gui.base)

        this.maracas = gui.maracas.map((m, i) => new Maraca(context, m, i == 0 ? "left" : "right"))

        // A maraca is taken by pulling the trigger while pointing at it, whatever the hand holds.
        context.observe(context.inputs.onTriggerDown, event => {
            const controller = event.pressable.controller
            const maraca = this.maracas.find(m => m.gui.holds(controller.pointer.targetMesh))
            maraca?.take(controller)
        })
    }

    async setState(_key: string, _value: any){}

    async getState(_key: string){}

    getStateKeys(){ return [] }

    async dispose(){
        this.maracas.forEach(m => m.release())
    }

}

/** One maraca: its output, and the way it goes to a hand and comes back. */
class Maraca {

    readonly output: MidiN3DConnectable.ListOutput

    readonly kind: ToolKind

    /** The way back to the tool the holding hand held before, while a hand holds the maraca. */
    #equipment: {dispose(): void}|null = null

    constructor(
        private readonly context: Node3DContext,
        readonly gui: MaracaGUI,
        side: "left"|"right",
    ){
        const {tools:T} = context

        this.output = new T.MidiN3DConnectable.ListOutput(`midioutput_${side}`, [gui.output], `${side} maraca MIDI Output`)
        context.createConnectable(this.output)

        this.kind = {
            label: "Maraca",
            description: "A maraca held until another tool is chosen. Shaking it plays a note, the harder the higher.",
            thumbnail: THUMBNAIL_URL,
            tags: ["percussive"],
            create: toolContext => new MaracaTool(this, toolContext),
        }
    }

    /** Put the maraca in the hand of a controller, taking it back from any other hand first. */
    take(controller: ControllerInput): void {
        if(DEBUG) console.log("[HandMaracas] taken by", controller.side, "pointing at", controller.pointer.targetMesh?.name)
        this.release()
        this.#equipment = this.context.equipTool(controller, this.kind)
    }

    /** Give the maraca back to its rest, and the holding hand its previous tool. */
    release(): void {
        this.#equipment?.dispose()
        this.#equipment = null
    }

    /** Play one shake of the given force, in m/s. */
    shake(force: number): void {
        const share = Math.min(Math.max(force - MIN_SHAKE_SPEED, 0) / (MAX_SHAKE_SPEED - MIN_SHAKE_SPEED), 1)
        const note = Math.round(LOW_NOTE + share * (HIGH_NOTE - LOW_NOTE))
        if(DEBUG) console.log(`[HandMaracas] shake speed ${force.toFixed(2)} m/s (min ${MIN_SHAKE_SPEED}, max ${MAX_SHAKE_SPEED}) -> note ${note}`)
        this.output.connections.forEach(conn => {
            const t = conn.context.currentTime
            conn.scheduleEvents({type:"wam-midi", time:t, data:{bytes:[0x90, note, 127]}})
            conn.scheduleEvents({type:"wam-midi", time:t+NOTE_DURATION, data:{bytes:[0x80, note, 0]}})
        })
    }

}

/**
 * The hand holding one maraca.
 *
 * The model of the maraca follows the hand while the tool lives, and goes back to its rest when
 * the tool is disposed. A shake is a reversal of the direction of the hand: the note played is
 * read from the fastest the hand went since the previous reversal.
 */
class MaracaTool implements Tool {

    readonly #observer

    /** Where the hand was at the previous frame, in world space. */
    readonly #previous = new Vector3()

    /** How the hand moved at the previous frame, in world space. */
    readonly #velocity = new Vector3()

    /** Scratch vector for the movement of the current frame. */
    readonly #movement = new Vector3()

    /** The fastest the hand went since the last reversal, in m/s. */
    #peak = 0

    constructor(
        private readonly maraca: Maraca,
        private readonly context: ToolContext,
    ){
        // The node is scaled down by the world : the maraca keeps the size it had on its rest.
        const holder = maraca.gui.holder
        holder.scaling.copyFrom(holder.absoluteScaling)
        holder.parent = context.visual
        holder.position.setAll(0)
        holder.rotation.set(HELD_TILT, 0, 0)

        this.#previous.copyFrom(context.controller.pointer.origin)

        // Read on the physics tick, whose step is fixed, not on the render frame.
        this.#observer = context.scene.onAfterPhysicsObservable.add(() => this.#update())
    }

    #update(): void {
        const dt = this.context.scene.getPhysicsEngine()?.getTimeStep() ?? this.context.scene.getEngine().getDeltaTime() / 1000
        if(dt <= 0) return

        const position = this.context.controller.pointer.origin
        position.subtractToRef(this.#previous, this.#movement).scaleInPlace(1 / dt)
        this.#previous.copyFrom(position)

        const speed = this.#movement.length()

        // The hand turned back : the shake reached its end, that is where it is heard.
        if(Vector3.Dot(this.#movement, this.#velocity) < 0){
            if(this.#peak >= MIN_SHAKE_SPEED){
                this.maraca.shake(this.#peak)
                this.context.controller.pulse(Math.min(this.#peak / MAX_SHAKE_SPEED, 1), 40)
            }
            this.#peak = 0
        }

        this.#peak = Math.max(this.#peak, speed)
        this.#velocity.copyFrom(this.#movement)
    }

    dispose(): void {
        if(DEBUG) console.trace("[HandMaracas] tool disposed")
        this.context.scene.onAfterPhysicsObservable.remove(this.#observer)
        const holder = this.maraca.gui.holder
        holder.parent = this.maraca.gui.rest
        holder.position.setAll(0)
        holder.rotation.setAll(0)
        holder.scaling.setAll(1)
    }

}



export const HandMaracasN3DFactory: Node3DFactory<HandMaracasN3DGUI,HandMaracasN3D> = {

    label: "Hand Maracas",

    description: "Two maracas to take in hand and shake. Each one plays a note on its own output, the harder the shake the higher the note.",

    tags: ["maracas", "midi", "generator", "live_instrument", "shake"],

    createGUI: async (context) => {
        const ret = new HandMaracasN3DGUI()
        await ret.init(context)
        return ret
    },

    create: async (context, gui) => new HandMaracasN3D(context,gui),

}
