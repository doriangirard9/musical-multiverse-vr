import { Color3, CreateBox, Observer, Quaternion, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { PointDriver } from "../common/PointDriver"
import { GROUND_HEIGHT } from "../../../app/SceneManager"
import THUMBNAIL_URL from "./thumbnail.png?url"

/** The length of each arm of the boomerang, in meters. */
const ARM_LENGTH = 0.22

/** The width and the thickness of each arm, in meters. */
const ARM_WIDTH = 0.05
const ARM_THICKNESS = 0.015

/** The angle between the two arms, in radians. */
const ARM_ANGLE = Math.PI * 100 / 180

/** The radius of each tip of the boomerang as a point of matter, in meters. */
const TIP_RADIUS = 0.04

/** The color of the boomerang. */
const COLOR = new Color3(0.75, 0.5, 0.25)

/**
 * How hard the grab pulls the boomerang back to the hand, per second squared per meter of
 * distance, with the grab fully closed.
 * The braking follows from it, so the response time is about `1 / sqrt(STIFFNESS)` seconds.
 */
const STIFFNESS = 100

/**
 * The speed, in meters per second, beyond which the pull adds no more speed.
 * It can still brake the boomerang or bend its path.
 */
const MAX_SPEED = 8

/** The pull of gravity on a boomerang at rest, in meters per second squared. */
const GRAVITY = -9.81

/**
 * The speed at which the boomerang carries half of its weight, in meters per second.
 * A spinning boomerang holds itself up as it flies: the pull of gravity is divided by
 * `1 + speed / LIFT_SPEED`, so it is whole at rest and falls off as the inverse of the speed.
 */
const LIFT_SPEED = 2

/** How much of the speed it hits the ground with the boomerang bounces back with, as a fraction. */
const BOUNCE = 0.3

/** How much of its speed along the ground a boomerang lying on it loses each second, as a fraction. */
const GROUND_FRICTION = 4

/**
 * How much of its speed a boomerang let go of loses each second to the air, as a fraction.
 * Without it a thrown boomerang would fly away forever.
 */
const DAMPING = 0.3

/** How many turns the boomerang makes per meter it flies. Its spin shows its speed. */
const TURNS_PER_METER = 1.5

/**
 * The longest step the flight is integrated over, in seconds.
 * The pull is a spring, which an explicit integration only keeps stable while
 * `sqrt(STIFFNESS) * step` stays well under 1.
 */
const MAX_SUBSTEP = 1 / 240

/** The longest frame the flight is integrated over, in seconds. A longer one is a hitch, not a gesture. */
const MAX_STEP = 0.1

/**
 * The hand throwing a boomerang: it flies on its own, plays whatever it hits, and comes back on call.
 *
 * @remarks
 * The boomerang is not carried by the hand, it has a position and a speed of its own. Holding the
 * grab pulls it back to the hand: a spring braked just enough never to swing past the hand and
 * back, so a boomerang called back settles in the hand and stays there, following it. Let go, it
 * keeps the speed it was given, which is how it is thrown: hold the grab, swing the arm, let go.
 *
 * Its two tips play, the way both ends of the staff do, and spinning sweeps them all around it.
 */
export class BoomerangTool implements Tool {


    constructor(context: ToolContext){
        this.#context = context
        this.#scene = context.scene

        this.#material = new StandardMaterial("boomerang", context.scene)
        this.#material.diffuseColor = COLOR
        this.#material.emissiveColor = COLOR.scale(0.3)

        this.#body = new TransformNode("boomerang", context.scene)
        this.#body.rotationQuaternion = new Quaternion()
        for(const side of [-1, 1]){
            const arm = CreateBox("boomerang arm", { width: ARM_LENGTH, height: ARM_THICKNESS, depth: ARM_WIDTH }, context.scene)
            arm.isPickable = false
            arm.material = this.#material
            arm.parent = this.#body
            arm.rotation.y = side * ARM_ANGLE / 2
            arm.position.set(Math.cos(ARM_ANGLE / 2) * ARM_LENGTH / 2, 0, -side * Math.sin(ARM_ANGLE / 2) * ARM_LENGTH / 2)
        }

        const pointer = context.controller.pointer
        this.#position.copyFrom(pointer.origin)
        this.#lastHand.copyFrom(pointer.origin)
        this.#show()

        this.#drivers = this.#tips.map((tip, index) => new PointDriver({
            label: `boomerang ${context.side} tip ${index}`,
            scene: context.scene,
            controller: context.controller,
            radius: TIP_RADIUS,
            position: () => tip,
            direction: () => this.#heading,
            baseVisible: false,
        }))

        this.#observer = context.scene.onAfterPhysicsObservable.add(() => this.#update())
    }

    public dispose(): void {
        this.#scene.onAfterPhysicsObservable.remove(this.#observer)
        for(const driver of this.#drivers) driver.dispose()
        this.#body.dispose()
        this.#material.dispose()
    }


    readonly #context: ToolContext

    readonly #scene: Scene

    readonly #body: TransformNode

    readonly #material: StandardMaterial

    /** The points of matter of the two tips, in the order of {@link #tips}. */
    readonly #drivers: PointDriver[]

    readonly #observer: Observer<Scene>

    /** Where the elbow of the boomerang is, in world space. Owned by the flight. */
    readonly #position = new Vector3()

    /** Where the two tips of the boomerang are, in world space. Laid each frame, and read by the drivers. */
    readonly #tips = [new Vector3(), new Vector3()]

    /** Where the two tips are in the frame of the boomerang, at the end of each arm. */
    static readonly #TIP_OFFSETS = [-1, 1].map(side => new Vector3(
        Math.cos(ARM_ANGLE / 2) * ARM_LENGTH,
        0,
        -side * Math.sin(ARM_ANGLE / 2) * ARM_LENGTH,
    ))

    /** How fast the boomerang flies, in meters per second. */
    readonly #velocity = new Vector3()

    /** Where the hand was the previous frame, to read how fast it moves. */
    readonly #lastHand = new Vector3()

    /** How fast the hand moves, in meters per second, read once per frame. */
    readonly #handVelocity = new Vector3()

    /** The way the boomerang looks, what it designates ahead of itself: where it flies, or where the hand points. */
    readonly #heading = new Vector3(0, 0, 1)

    /** How far the boomerang has turned around itself, in radians. */
    #turn = 0

    /** Scratch vectors, so flying each frame allocates nothing. */
    readonly #acceleration = new Vector3()
    readonly #relative = new Vector3()

    /** Read the hand, fly for the length of the frame, then lay the boomerang where it went. */
    #update(): void {
        const step = this.#scene.getEngine().getDeltaTime() / 1000
        const hand = this.#context.controller.pointer.origin
        const call = this.#context.controller.squeeze.getValue()

        if(step > 0 && step <= MAX_STEP){
            hand.subtractToRef(this.#lastHand, this.#handVelocity).scaleInPlace(1 / step)

            const count = Math.ceil(step / MAX_SUBSTEP)
            const substep = step / count
            for(let index = 0; index < count; index++) this.#flyBy(substep, call, hand)

            this.#turn += this.#velocity.length() * step * TURNS_PER_METER * 2 * Math.PI
            this.#turn %= 2 * Math.PI
        }
        this.#lastHand.copyFrom(hand)

        this.#show()
    }

    /**
     * Integrate the flight over one step.
     *
     * Called back, the boomerang is pulled to the hand by a spring, and the speed it has on top of
     * the hand's is braked. The braking is critical, `2 * sqrt(stiffness)`: the distance then dies
     * out as `(A + B t) e^(-sqrt(stiffness) t)`, which crosses zero at most once and never swings
     * back. Let go, only the air slows it. Gravity pulls it either way, the less the faster it
     * flies, so a boomerang called back hangs a little under the hand, by `GRAVITY / stiffness`,
     * the looser the grab the lower.
     *
     * @param step - The length of the step, in seconds.
     * @param call - How closed the grab is, from 0 to 1, which sets how firm the pull is.
     * @param hand - Where the hand is, which the pull brings the boomerang to.
     */
    #flyBy(step: number, call: number, hand: Vector3): void {
        if(call > 0){
            const stiffness = STIFFNESS * call

            hand.subtractToRef(this.#position, this.#acceleration).scaleInPlace(stiffness)
            this.#velocity.subtractToRef(this.#handVelocity, this.#relative)
            this.#acceleration.subtractInPlace(this.#relative.scaleInPlace(2 * Math.sqrt(stiffness)))

            const speed = this.#velocity.length()
            if(speed >= MAX_SPEED){
                const pushing = Vector3.Dot(this.#acceleration, this.#velocity) / speed
                if(pushing > 0) this.#acceleration.subtractInPlace(this.#velocity.scale(pushing / speed))
            }

            this.#velocity.addInPlace(this.#acceleration.scaleInPlace(step))
        }
        else this.#velocity.scaleInPlace(Math.max(0, 1 - DAMPING * step))

        this.#velocity.y += GRAVITY / (1 + this.#velocity.length() / LIFT_SPEED) * step
        this.#position.addInPlace(this.#velocity.scale(step))

        this.#meetGround(step)
    }

    /**
     * Stop the boomerang at the ground: what goes into it bounces back, weakened, and what runs
     * along it is rubbed away.
     */
    #meetGround(step: number): void {
        const floor = GROUND_HEIGHT + ARM_THICKNESS / 2
        if(this.#position.y > floor) return

        this.#position.y = floor
        if(this.#velocity.y < 0) this.#velocity.y *= -BOUNCE

        const friction = Math.max(0, 1 - GROUND_FRICTION * step)
        this.#velocity.x *= friction
        this.#velocity.z *= friction
    }

    /** Lay the boomerang where it flew, spinning flat, place its tips, and read where it looks. */
    #show(): void {
        const rotation = this.#body.rotationQuaternion!
        this.#body.position.copyFrom(this.#position)
        Quaternion.RotationYawPitchRollToRef(this.#turn, 0, 0, rotation)

        BoomerangTool.#TIP_OFFSETS.forEach((offset, index) => {
            offset.rotateByQuaternionToRef(rotation, this.#tips[index]).addInPlace(this.#position)
        })

        const speed = this.#velocity.length()
        if(speed > 0) this.#heading.copyFrom(this.#velocity).scaleInPlace(1 / speed)
        else this.#heading.copyFrom(this.#context.controller.pointer.forward)
    }

}

/** The kind of the hand throwing a boomerang. */
export const BOOMERANG_TOOL_KIND: ToolKind = {
    label: "Boomerang",
    description: "A boomerang flying on its own, called back to the hand by the trigger, which strikes instruments as it flies.",
    thumbnail: THUMBNAIL_URL,
    tags: ["playing", "contact", "percussive", "boomerang", "physic", "throw", "weapon"],
    create: context => new BoomerangTool(context),
}
