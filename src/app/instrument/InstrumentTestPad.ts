// A cube to check with one's own hands that the hands reach the instruments.

import { Color3, CreateBox, Matrix, Mesh, Scene, StandardMaterial, Vector3 } from "@babylonjs/core"
import { ActivateBehavior, HoldBehavior, InstrumentInteractionSystem, InstrumentTouchEvent, Interactor, SurfaceBehavior } from "../../instrument"
import { N3DText, N3DTextDescription } from "../../node3d/instance/utils/N3DText"

/** Scratch matrix for the world to local conversion of a normal. */
const INVERSE = Matrix.Identity()

/** The size of the pad, in meters. */
const SIZE = 0.4

/** The colors of the pad: untouched, designated, held, and pressed. */
const IDLE_COLOR = new Color3(0.25, 0.25, 0.3)
const AIMED_COLOR = new Color3(0.35, 0.45, 0.6)
const HELD_COLOR = new Color3(0.4, 0.9, 0.5)
const ACTIVE_COLOR = new Color3(0.85, 0.35, 0.9)

/** The colors of the two flashes: a point entering the matter, and a point leaving it. */
const DOWN_COLOR = new Color3(1, 0.9, 0.4)
const UP_COLOR = new Color3(0.9, 0.3, 0.3)

/**
 * How far above the pad the panel floats, in panel heights.
 * The lines are written from the top of the panel downwards, so a panel merely set on top of the
 * cube sinks its detailed list into it: the whole thing is lifted by its own height instead.
 */
const TEXT_LIFT = 1.5

/**
 * The depth of a press read as a full push, in meters.
 * A point held in the matter has no velocity left, so how deep it sits is the only thing still
 * saying how hard it presses. The value follows the reach of the ray hand, whose fully pressed
 * trigger is the ordinary full push.
 */
const FULL_DEPTH = 0.06

/** How long a flash lasts, in seconds. */
const FLASH = 0.2

/** The strength and length of the pulse of an ordinary blow. */
const PULSE_STRENGTH = 0.6
const PULSE_DURATION = 40

/**
 * What the pad remembers of a point currently pressing it.
 *
 * @remarks
 * A touch keeps the velocity it entered with for its whole life, so {@link Press.entryForce} never
 * moves once the point is in the matter. What the hand does afterwards is only readable from the
 * velocity of the interactor itself, against the normal the touch landed on, which is what
 * {@link InstrumentTestPad} reads every frame as the force of the moment.
 */
interface Press {

    /** The point pressing, kept to read its velocity of the moment. */
    readonly interactor: Interactor

    /** The normal of the surface the point landed on, in world space. */
    readonly normal: Vector3

    /** How hard the point drove in, 1 being the ordinary gesture. Fixed for the whole press. */
    readonly entryForce: number

    /** When the press started, in seconds. */
    readonly since: number

    /** Where the point lies in the box of the mesh, none before it moved. */
    spot?: Vector3

    /** How deep the point sits under the face it entered, in meters. */
    depth: number

}

/** What the pad remembers of the last point that left it. */
interface Release {

    /** The identity of the interactor that left. */
    readonly id: string

    /** The speed the point left with, in units per second. */
    readonly speed: number

    /** How long the press lasted, in seconds. */
    readonly duration: number

    /** When the release happened, in seconds. */
    readonly at: number

}

/** What the pad remembers of a point currently pressing on it, the click rather than the contact. */
interface Activation {

    /** How hard it presses, between 0 and 1. */
    value: number

    /** When the activation started, in seconds. */
    readonly since: number

}

/** What the pad remembers of the last activation that ended. */
interface Deactivation {

    /** The identity of the interactor that stopped pressing. */
    readonly id: string

    /** How long the activation lasted, in seconds. */
    readonly duration: number

    /** When it ended, in seconds. */
    readonly at: number

}

/**
 * A cube that lights up when a hand designates it, flashes when a hand presses it, and writes above
 * itself everything it knows of the hands on it.
 *
 * @remarks
 * Nothing in the world carries an instrument behavior yet, so nothing would answer a hand: the pad
 * exists to make the chain visible, from the point of matter of a hand down to the behaviors. It
 * makes no sound, since what it checks is the gesture and not the audio. Its color says the state at
 * a glance and its {@link N3DText} says the numbers behind it, so a gesture read wrong can be told
 * apart from a gesture not detected at all.
 */
export class InstrumentTestPad {


    /** The cube itself. */
    public readonly mesh: Mesh

    /** The debug panel floating above the cube. */
    public readonly text: N3DText

    constructor(scene: Scene, position: Vector3){
        const material = new StandardMaterial("test pad", scene)
        material.diffuseColor = IDLE_COLOR.clone()
        material.emissiveColor = IDLE_COLOR.scale(0.5)
        this.#material = material

        this.mesh = CreateBox("test pad", { size: SIZE }, scene)
        this.mesh.position.copyFrom(position)
        this.mesh.material = material
        this.mesh.isPickable = true

        this.text = new N3DText("test pad", [this.mesh], scene)
        this.text.show()

        // Held rather than struck, so the panel can show a press as long as it lasts.
        this.mesh.addBehavior(new HoldBehavior({
            onDown: (force, event) => {
                this.#presses.set(event.id, {
                    interactor: event.interactor,
                    normal: event.normal.clone(),
                    entryForce: force,
                    since: this.#now(),
                    depth: this.#depthOf(event),
                })
                this.#flash(DOWN_COLOR, Math.min(1, force))
                event.interactor.pulse(Math.min(1, PULSE_STRENGTH * force), PULSE_DURATION)
            },
            onMove: event => {
                const press = this.#presses.get(event.id)
                if(press === undefined) return

                // The normal follows the face the point slid onto, so the force is read against it.
                press.normal.copyFrom(event.normal)
                press.depth = this.#depthOf(event)
            },
            onUp: event => {
                const press = this.#presses.get(event.id)
                this.#presses.delete(event.id)
                this.#release = {
                    id: event.id,
                    speed: event.velocity.length(),
                    duration: press === undefined ? 0 : this.#now() - press.since,
                    at: this.#now(),
                }
                this.#flash(UP_COLOR, 1)
            },
        }))

        this.mesh.addBehavior(new SurfaceBehavior({
            onMove: spot => {
                const press = this.#presses.get(spot.id)
                if(press !== undefined) press.spot = spot.normalized
            },
        }))

        // The click on top of the contact: what a hand wills, rather than what it merely reaches.
        this.mesh.addBehavior(new ActivateBehavior({
            onActivate: (value, event) => {
                this.#activations.set(event.id, { value, since: this.#now() })
            },
            onChange: (value, event) => {
                const activation = this.#activations.get(event.id)
                if(activation !== undefined) activation.value = value
            },
            onDeactivate: event => {
                const activation = this.#activations.get(event.id)
                this.#activations.delete(event.id)
                this.#deactivation = {
                    id: event.id,
                    duration: activation === undefined ? 0 : this.#now() - activation.since,
                    at: this.#now(),
                }
            },
        }))

        this.#observer = scene.onBeforeRenderObservable.add(() => this.#update())
    }

    public dispose(): void {
        this.#observer.remove()
        this.text.dispose()
        this.mesh.dispose()
        this.#material.dispose()
    }


    readonly #material: StandardMaterial

    readonly #observer

    /** The points currently pressing the pad, by the identity of their interactor. */
    readonly #presses = new Map<string, Press>()

    /** The points currently clicking on the pad, by the identity of their interactor. */
    readonly #activations = new Map<string, Activation>()

    /** The last activation that ended, none before the first one. */
    #deactivation?: Deactivation

    /** The last point that left the pad, none before the first release. */
    #release?: Release

    /** The color of the flash currently fading, none once it faded. */
    #flashColor?: Color3

    /** When the fading flash started, in seconds. */
    #flashSince = -Infinity

    /** The current time, in seconds. */
    #now(): number { return performance.now() / 1000 }

    /**
     * How hard a press drives into the pad right now, 1 being the ordinary gesture.
     * Negative when the point is on its way out, which is what the color has to ignore.
     */
    #liveForce(press: Press): number {
        return -Vector3.Dot(press.interactor.velocity, press.normal)
    }

    /**
     * How hard a press pushes on the pad right now, 1 being the ordinary full push.
     * A moving point reads from its velocity and a held one from its depth, so a blow and a hand
     * leaning on the pad both read as a push, and only a point on its way out reads as nothing.
     */
    #push(press: Press): number {
        return Math.max(0, this.#liveForce(press), press.depth / FULL_DEPTH)
    }

    /**
     * How deep under the face it entered the point of a touch sits, in meters.
     * Read in the box of the mesh, along the axis its normal points down, since that face is the one
     * the point came through.
     */
    #depthOf(event: InstrumentTouchEvent): number {
        this.mesh.getWorldMatrix().invertToRef(INVERSE)
        const normal = Vector3.TransformNormal(event.normal, INVERSE)

        const box = this.mesh.getBoundingInfo().boundingBox
        const axes = [
            { normal: normal.x, local: event.local.x, min: box.minimum.x, max: box.maximum.x },
            { normal: normal.y, local: event.local.y, min: box.minimum.y, max: box.maximum.y },
            { normal: normal.z, local: event.local.z, min: box.minimum.z, max: box.maximum.z },
        ]

        const axis = axes.reduce((a, b) => Math.abs(a.normal) >= Math.abs(b.normal) ? a : b)
        const depth = axis.normal >= 0 ? axis.max - axis.local : axis.local - axis.min
        return Math.max(0, depth)
    }

    /** Light the pad up for the length of a gesture, the harder the brighter. */
    #flash(color: Color3, strength: number): void {
        this.#flashColor = color.scale(strength)
        this.#flashSince = this.#now()
    }

    /**
     * The aims currently open on the pad, read from the system rather than counted here.
     * The distance is taken from the aimed point to the middle of the pad, so a point sliding on the
     * face reads a little further than a point in front of it.
     */
    #hovers(): { id: string, distance: number, speed: number }[] {
        const center = this.mesh.getBoundingInfo().boundingBox.centerWorld
        return InstrumentInteractionSystem.getInstance().aims
            .filter(aim => aim.mesh === this.mesh)
            .map(aim => ({
                id: aim.id,
                distance: Vector3.Distance(aim.point, center),
                speed: aim.interactor.velocity.length(),
            }))
    }

    /** Repaint the pad and rewrite the panel from the state of the moment. */
    #update(): void {
        const now = this.#now()
        const hovers = this.#hovers()

        // The color says the state, the flash sitting on top of it while it fades. Under a press it
        // goes from the color of a mere approach to the full contact color with the speed of the
        // points on it, so a hand moving fast on the pad reads at a glance and two hands add up.
        let base: Color3
        if(this.#presses.size > 0){
            let total = 0
            for(const press of this.#presses.values()) total += press.interactor.velocity.length()
            base = Color3.Lerp(AIMED_COLOR, HELD_COLOR, Math.min(1, total))
        }
        else base = hovers.length > 0 ? AIMED_COLOR : IDLE_COLOR

        // A click wins over everything below it: it is what an instrument would answer to.
        if(this.#activations.size > 0){
            let pressure = 0
            for(const activation of this.#activations.values()) pressure += activation.value
            base = Color3.Lerp(base, ACTIVE_COLOR, Math.min(1, pressure))
        }
        this.#material.diffuseColor.copyFrom(base)

        const age = now - this.#flashSince
        if(this.#flashColor !== undefined && age < FLASH){
            this.#material.emissiveColor.copyFrom(base.scale(0.5).add(this.#flashColor.scale(1 - age / FLASH)))
        }
        else{
            this.#flashColor = undefined
            this.#material.emissiveColor.copyFrom(base.scale(0.5))
        }

        this.text.set(this.#lines(now, hovers))
        this.text.updatePosition()
        this.text.plane.position.y += this.text.plane.getBoundingInfo().boundingBox.extendSizeWorld.y * 2 * TEXT_LIFT
    }

    /** What the panel says of the state of the moment. */
    #lines(now: number, hovers: { id: string, distance: number, speed: number }[]): N3DTextDescription {
        const lines: N3DTextDescription = [
            { content: "Instrument test pad", size: 0.8, underline: true },
        ]

        const pressed = this.#presses.size > 0
        lines.push({
            content: `press: ${pressed ? "OUI" : "non"} (${this.#presses.size})`,
            size: 0.7,
            color: pressed ? "#66ff88" : "#aaaaaa",
        })
        for(const [id, press] of this.#presses){
            const spot = press.spot
            const where = spot === undefined ? "" : ` @${spot.x.toFixed(2)},${spot.y.toFixed(2)},${spot.z.toFixed(2)}`
            lines.push({
                content: `  ${id} pousse=${this.#push(press).toFixed(2)} f=${this.#liveForce(press).toFixed(2)} entree=${press.entryForce.toFixed(2)} v=${press.interactor.velocity.length().toFixed(2)} prof=${(press.depth * 1000).toFixed(0)}mm tenu=${(now - press.since).toFixed(1)}s${where}`,
                size: 0.5,
                color: "#66ff88",
            })
        }

        const activated = this.#activations.size > 0
        lines.push({
            content: `activate: ${activated ? "OUI" : "non"} (${this.#activations.size})`,
            size: 0.7,
            color: activated ? "#ee88ff" : "#aaaaaa",
        })
        for(const [id, activation] of this.#activations){
            lines.push({
                content: `  ${id} valeur=${activation.value.toFixed(2)} tenu=${(now - activation.since).toFixed(1)}s`,
                size: 0.5,
                color: "#ee88ff",
            })
        }

        const hovered = hovers.length > 0
        lines.push({
            content: `hover: ${hovered ? "OUI" : "non"} (${hovers.length})`,
            size: 0.7,
            color: hovered ? "#88bbff" : "#aaaaaa",
        })
        for(const hover of hovers){
            lines.push({
                content: `  ${hover.id} dist=${hover.distance.toFixed(3)}m v=${hover.speed.toFixed(2)}`,
                size: 0.5,
                color: "#88bbff",
            })
        }

        const release = this.#release
        if(release === undefined) lines.push({ content: "lachage: aucun", size: 0.6, color: "#aaaaaa" })
        else lines.push({
            content: `lachage: ${release.id} v=${release.speed.toFixed(2)} duree=${release.duration.toFixed(2)}s il y a ${(now - release.at).toFixed(1)}s`,
            size: 0.6,
            color: now - release.at < 1 ? "#ff8888" : "#aaaaaa",
        })

        const deactivation = this.#deactivation
        if(deactivation === undefined) lines.push({ content: "declic: aucun", size: 0.6, color: "#aaaaaa" })
        else lines.push({
            content: `declic: ${deactivation.id} duree=${deactivation.duration.toFixed(2)}s il y a ${(now - deactivation.at).toFixed(1)}s`,
            size: 0.6,
            color: now - deactivation.at < 1 ? "#ffaaff" : "#aaaaaa",
        })

        return lines
    }

}
