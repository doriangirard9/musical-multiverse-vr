

import { Color3, CreateCylinder, CreateIcoSphere, Mesh, Observer, Quaternion, Scene, StandardMaterial, Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { PointDriver } from "../common/PointDriver"
import { SqueezeAdjust } from "../common/SqueezeAdjust"
import { WAND_TILT } from "../wand/WandTool"
import THUMBNAIL_URL from "./thumbnail.png?url"

/** The length of the chain at creation, in meters. */
const CHAIN = 0.35

/** The shortest and longest the chain can be made, in meters. */
const MIN_CHAIN = 0.12
const MAX_CHAIN = 1.2

/** The length added or removed at each step of the adjustment, in meters. */
const CHAIN_STEP = 0.05

/** The radius of the ball, in meters. */
const BALL_RADIUS = 0.035

/** The thickness of the chain, in meters. */
const CHAIN_DIAMETER = 0.008

/** How far ahead of the hand the chain hangs from, in meters, so the ball clears the hand. */
const FORWARD = 0.06

/** The colors of the ball and of the chain. */
const BALL_COLOR = new Color3(0.55, 0.55, 0.6)
const CHAIN_COLOR = new Color3(0.35, 0.35, 0.4)

/** The pull of gravity on the ball, in meters per second squared. */
const GRAVITY = -9.81

/**
 * How much of its speed the ball loses each second, as a fraction.
 * The air alone would let it swing forever, which reads as a ball that will not settle.
 */
const DAMPING = 0.8

/**
 * How hard the chain pulls the ball back once it is stretched, per second squared per meter.
 * High enough that the chain reads as a chain and not as a rubber band: the ball may lag behind a
 * hand that yanks it, but it must not bounce back and forth along it.
 */
const STIFFNESS = 2500

/**
 * How much of the stretching speed the chain swallows each second, as a fraction.
 * The pull alone makes a spring, which springs back: taking the speed that stretches the chain is
 * what makes it a chain, the ball keeping only what turns it around the hand.
 */
const CHAIN_DAMPING = 20

/**
 * The shortest the grab pulls the chain in, as a fraction of its length.
 * A fully closed hand holds the ball in short, the way a chain is wound around the fist, so the
 * user can rein a swing in and let it out again without ever letting go of the flail.
 */
const GRAB_SHORTEN = 0.75

/**
 * The longest step the swing is integrated over, in seconds.
 * The pull of the chain is stiff, so a long step lets the ball overshoot and the swing explode.
 * It has to stay well under `2 / sqrt(STIFFNESS)`, which is where such an integration blows up.
 */
const MAX_SUBSTEP = 1 / 480

/** The longest frame the swing is integrated over, in seconds. A longer one is a hitch, not a gesture. */
const MAX_STEP = 0.1

/**
 * The hand swinging a flail: a ball hanging from the hand by a chain, which plays whatever it hits.
 *
 * @remarks
 * The ball is not placed by the hand, it is thrown by it: it falls, it swings, and the chain holds
 * it back. The force of a blow is the force the user built up by turning the wrist, and a ball
 * still swinging keeps playing after the arm has stopped. Closing the grab reins the chain in.
 *
 * It is the hand for playing with momentum rather than with aim.
 */
export class FlailTool implements Tool {


    constructor(context: ToolContext){
        this.#context = context
        this.#scene = context.scene

        this.#ballMaterial = FlailTool.#materialOf(context.scene, "flail ball", BALL_COLOR)
        this.#chainMaterial = FlailTool.#materialOf(context.scene, "flail chain", CHAIN_COLOR)

        this.#ball = CreateIcoSphere("flail ball", { radius: BALL_RADIUS, subdivisions: 3 }, context.scene)
        this.#ball.isPickable = false
        this.#ball.material = this.#ballMaterial

        this.#chainMesh = CreateCylinder("flail chain", { diameter: CHAIN_DIAMETER, height: 1, subdivisions: 1 }, context.scene)
        this.#chainMesh.isPickable = false
        this.#chainMesh.material = this.#chainMaterial
        this.#chainMesh.rotationQuaternion = new Quaternion()

        this.#adjust = new SqueezeAdjust(context.controller, {
            value: CHAIN,
            min: MIN_CHAIN,
            max: MAX_CHAIN,
            step: CHAIN_STEP,
            onChange: chain => { this.#chain = chain },
        })

        this.#readAnchor()
        this.#position.copyFrom(this.#anchor)
        this.#position.y -= this.#reach

        this.#driver = new PointDriver({
            label: `flail ${context.side}`,
            scene: context.scene,
            controller: context.controller,
            radius: BALL_RADIUS,
            position: () => this.#position,
            direction: () => this.#swing,
        })

        this.#observer = context.scene.onAfterPhysicsObservable.add(() => this.#update())
    }

    public dispose(): void {
        this.#scene.onAfterPhysicsObservable.remove(this.#observer)
        this.#driver.dispose()
        this.#adjust.dispose()
        this.#ball.dispose()
        this.#chainMesh.dispose()
        this.#ballMaterial.dispose()
        this.#chainMaterial.dispose()
    }


    readonly #context: ToolContext

    readonly #scene: Scene

    readonly #ball: Mesh

    readonly #chainMesh: Mesh

    readonly #ballMaterial: StandardMaterial

    readonly #chainMaterial: StandardMaterial

    readonly #adjust: SqueezeAdjust

    readonly #driver: PointDriver

    readonly #observer: Observer<Scene>

    /** The length of the chain when the hand is open, in meters. */
    #chain = CHAIN

    /** How long the chain is right now, the grab pulling it in, in meters. */
    get #reach(): number {
        return this.#chain * (1 - GRAB_SHORTEN * this.#context.controller.squeeze.getValue())
    }

    /** Where the chain hangs from, in world space, read once per frame. */
    readonly #anchor = new Vector3()

    /** Where the ball is, in world space. Owned by the swing, and read by the driver. */
    readonly #position = new Vector3()

    /** How fast the ball moves, in meters per second. */
    readonly #velocity = new Vector3()

    /** Scratch vector for the chain, so swinging the ball each frame allocates nothing. */
    readonly #offset = new Vector3()

    /** The direction the ball is thrown towards, what it designates ahead of itself. */
    get #swing(): Vector3 {
        this.#position.subtractToRef(this.#anchor, this.#offset)
        const length = this.#offset.length()
        return length === 0 ? this.#context.controller.pointer.forward : this.#offset.scale(1 / length)
    }

    /** Read where the chain hangs from: ahead of the hand, along the way a wand is held. */
    #readAnchor(): void {
        const pointer = this.#context.controller.pointer
        this.#anchor.copyFrom(pointer.origin)
        this.#anchor.addInPlace(pointer.forward.scale(Math.cos(WAND_TILT) * FORWARD))
        this.#anchor.addInPlace(pointer.up.scale(Math.sin(WAND_TILT) * FORWARD))
    }

    /** Swing the ball for the length of the frame, then lay the ball and the chain where it went. */
    #update(): void {
        this.#readAnchor()

        const step = this.#scene.getEngine().getDeltaTime() / 1000
        if(step > 0 && step <= MAX_STEP){
            const reach = this.#reach
            const count = Math.ceil(step / MAX_SUBSTEP)
            const substep = step / count
            for(let index = 0; index < count; index++) this.#swingBy(substep, reach)
        }

        this.#show()
    }

    /**
     * Integrate the swing over one step: gravity and the chain pull on the speed, the speed moves
     * the ball.
     *
     * The chain pulls only once stretched, a chain never pushing, and swallows what stretches it so
     * the ball does not spring back. The position is never corrected.
     *
     * @param step - The length of the step, in seconds.
     */
    #swingBy(step: number, reach: number): void {
        this.#velocity.y += GRAVITY * step

        this.#position.subtractToRef(this.#anchor, this.#offset)
        const length = this.#offset.length()
        if(length > reach && length > 0){
            this.#offset.scaleInPlace(1 / length)

            this.#velocity.subtractInPlace(this.#offset.scale((length - reach) * STIFFNESS * step))

            const stretching = Vector3.Dot(this.#velocity, this.#offset)
            if(stretching > 0){
                this.#velocity.subtractInPlace(this.#offset.scale(stretching * Math.min(1, CHAIN_DAMPING * step)))
            }
        }

        this.#velocity.scaleInPlace(Math.max(0, 1 - DAMPING * step))
        this.#position.addInPlace(this.#velocity.scale(step))
    }

    /** Lay the ball where the swing left it, and stretch the chain from the hand to it. */
    #show(): void {
        this.#ball.position.copyFrom(this.#position)

        this.#position.subtractToRef(this.#anchor, this.#offset)
        const length = this.#offset.length()

        this.#chainMesh.setEnabled(length > 0)
        if(length === 0) return

        this.#chainMesh.position.copyFrom(this.#anchor).addInPlace(this.#position).scaleInPlace(0.5)
        this.#chainMesh.scaling.y = length
        Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, this.#offset.scale(1 / length), this.#chainMesh.rotationQuaternion!)
    }

    static #materialOf(scene: Scene, name: string, color: Color3): StandardMaterial {
        const material = new StandardMaterial(name, scene)
        material.diffuseColor = color
        material.emissiveColor = color.scale(0.3)
        return material
    }

}

/** The kind of the hand swinging a flail. */
export const FLAIL_TOOL_KIND: ToolKind = {
    label: "Flail",
    description: "A physics-based flail whose head can strike instruments.",
    thumbnail: THUMBNAIL_URL,
    tags: ["playing", "contact", "percussive", "adjustable", "length", "flail", "physic", "weapon"],
    create: context => new FlailTool(context),
}
