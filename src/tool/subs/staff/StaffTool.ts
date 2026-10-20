import { Color3, CreateCylinder, Mesh, Observer, Quaternion, Scene, StandardMaterial, Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { PointDriver } from "../common/PointDriver"
import { WAND_TILT } from "../wand/WandTool"
import THUMBNAIL_URL from "./thumbnail.png?url"

/** The length of the staff, in meters. */
const LENGTH = 1.4

/** The thickness of the staff, in meters. */
const DIAMETER = 0.03

/** The radius of each end as a point of matter, in meters. */
const END_RADIUS = 0.03

/** The color of the staff. */
const STAFF_COLOR = new Color3(0.45, 0.3, 0.16)

/**
 * How hard the grip turns the staff back to the way it was held, per second squared per radian of
 * difference, with the grab fully closed.
 * The braking follows from it, so the response time is about `1 / sqrt(STIFFNESS)` seconds.
 */
const STIFFNESS = 400

/**
 * The spin, in radians per second, beyond which the grip adds no more speed.
 * It can still brake the staff or turn it another way.
 */
const MAX_SPEED = 25

/**
 * How much of its spin a staff let go of loses each second to the air, as a fraction.
 * Without it a thrown staff would spin forever.
 */
const DAMPING = 0.3

/**
 * The longest step the spin is integrated over, in seconds.
 * The grip is a spring, which an explicit integration only keeps stable while
 * `sqrt(STIFFNESS) * step` stays well under 1.
 */
const MAX_SUBSTEP = 1 / 240

/** The longest frame the spin is integrated over, in seconds. A longer one is a hitch, not a gesture. */
const MAX_STEP = 0.1

/**
 * The hand twirling a bo staff: a long staff held by its middle, both ends of which play what they hit.
 *
 * @remarks
 * The staff sits in the hand but does not turn with it: it has a spin of its own. Closing the grab
 * grips it, remembering the way it lies in the hand at that moment, and from then on the grip pulls
 * it back to that way as the hand turns. The pull is a spring braked just enough never to swing
 * back and forth, so a still hand holds a still staff. Let go, the staff keeps the spin it was
 * given, which is how it is thrown into a twirl: grab, turn the wrist, let go.
 *
 * The staff is a cylinder, so its roll around its own length shows nothing and strikes nothing:
 * it is described by its direction alone, and so is the way it is held.
 */
export class StaffTool implements Tool {


    constructor(context: ToolContext){
        this.#context = context
        this.#scene = context.scene

        this.#material = new StandardMaterial("staff", context.scene)
        this.#material.diffuseColor = STAFF_COLOR
        this.#material.emissiveColor = STAFF_COLOR.scale(0.3)

        this.#staff = CreateCylinder("staff", { diameter: DIAMETER, height: LENGTH, tessellation: 12 }, context.scene)
        this.#staff.isPickable = false
        this.#staff.material = this.#material
        this.#staff.rotationQuaternion = new Quaternion()

        const pointer = context.controller.pointer
        this.#axis.copyFrom(pointer.forward).scaleInPlace(Math.cos(WAND_TILT))
        this.#axis.addInPlace(pointer.up.scale(Math.sin(WAND_TILT)))
        if(this.#axis.lengthSquared() === 0) this.#axis.set(0, 1, 0)
        this.#axis.normalize()
        this.#placeEnds()

        this.#head = new PointDriver({
            label: `staff ${context.side} head`,
            scene: context.scene,
            controller: context.controller,
            radius: END_RADIUS,
            position: () => this.#headPosition,
            direction: () => this.#axis,
        })

        this.#foot = new PointDriver({
            label: `staff ${context.side} foot`,
            scene: context.scene,
            controller: context.controller,
            radius: END_RADIUS,
            position: () => this.#footPosition,
            direction: () => this.#backward,
        })

        this.#observer = context.scene.onAfterPhysicsObservable.add(() => this.#update())
    }

    public dispose(): void {
        this.#scene.onAfterPhysicsObservable.remove(this.#observer)
        this.#head.dispose()
        this.#foot.dispose()
        this.#staff.dispose()
        this.#material.dispose()
    }


    readonly #context: ToolContext

    readonly #scene: Scene

    readonly #staff: Mesh

    readonly #material: StandardMaterial

    readonly #head: PointDriver

    readonly #foot: PointDriver

    readonly #observer: Observer<Scene>

    /** The direction the staff lies along, in world space, from the foot to the head. */
    readonly #axis = new Vector3()

    /** The opposite of {@link #axis}, the way the foot looks. */
    readonly #backward = new Vector3()

    /** How fast the staff turns, in radians per second around a world axis, always across its length. */
    readonly #spin = new Vector3()

    /** The way the staff was gripped, as its coordinates along the right, up and forward of the hand. */
    readonly #hold = new Vector3()

    /** The direction the grip pulls the staff to this frame, in world space. */
    readonly #target = new Vector3()

    /** The direction the grip pulled the staff to the previous frame, to read how fast the hand turns it. */
    readonly #lastTarget = new Vector3()

    /** How fast the hand turns the gripped direction, in radians per second around a world axis. */
    readonly #targetSpin = new Vector3()

    /** Where the ends of the staff are, in world space. Owned here, and read by the drivers. */
    readonly #headPosition = new Vector3()
    readonly #footPosition = new Vector3()

    /** How closed the grab was the previous frame, to notice the moment it starts gripping. */
    #lastGrab = 0

    /** Scratch values, so turning the staff each frame allocates nothing. */
    readonly #turn = new Vector3()
    readonly #acceleration = new Vector3()
    readonly #relative = new Vector3()
    readonly #rotation = new Quaternion()

    /** Grip or release the staff, turn it for the length of the frame, then lay it in the hand. */
    #update(): void {
        const step = this.#scene.getEngine().getDeltaTime() / 1000
        const grab = this.#context.controller.squeeze.getValue()

        if(grab > 0){
            if(this.#lastGrab === 0) this.#grip()
            this.#readTarget(step)
        }
        this.#lastGrab = grab

        if(step > 0 && step <= MAX_STEP){
            const count = Math.ceil(step / MAX_SUBSTEP)
            const substep = step / count
            for(let index = 0; index < count; index++) this.#turnBy(substep, grab)
        }

        this.#placeEnds()
        this.#show()
    }

    /** Remember the way the staff lies in the hand, which the grip will hold it to. */
    #grip(): void {
        const pointer = this.#context.controller.pointer
        this.#hold.set(
            Vector3.Dot(this.#axis, pointer.right),
            Vector3.Dot(this.#axis, pointer.up),
            Vector3.Dot(this.#axis, pointer.forward),
        )
        this.#lastTarget.copyFrom(this.#axis)
    }

    /** Read where the grip pulls the staff to, and how fast the hand turns that direction. */
    #readTarget(step: number): void {
        const pointer = this.#context.controller.pointer
        this.#target.copyFrom(pointer.right).scaleInPlace(this.#hold.x)
        this.#target.addInPlace(pointer.up.scale(this.#hold.y))
        this.#target.addInPlace(pointer.forward.scale(this.#hold.z))
        this.#target.normalize()

        this.#targetSpin.setAll(0)
        if(step > 0 && step <= MAX_STEP){
            Vector3.CrossToRef(this.#lastTarget, this.#target, this.#targetSpin)
            const sine = this.#targetSpin.length()
            if(sine > 0){
                const angle = Math.atan2(sine, Vector3.Dot(this.#lastTarget, this.#target))
                this.#targetSpin.scaleInPlace(angle / sine / step)
            }
        }
        this.#lastTarget.copyFrom(this.#target)
    }

    /**
     * Integrate the spin over one step, then turn the staff by it.
     *
     * Gripped, the staff is pulled towards the held direction by a spring, and the spin it has on
     * top of the hand's is braked. The braking is critical, `2 * sqrt(stiffness)`: the difference
     * then dies out as `(A + B t) e^(-sqrt(stiffness) t)`, which crosses zero at most once and
     * never swings back. Released, only the air slows it.
     *
     * @param step - The length of the step, in seconds.
     * @param grab - How closed the grab is, from 0 to 1, which sets how firm the grip is.
     */
    #turnBy(step: number, grab: number): void {
        if(grab > 0){
            const stiffness = STIFFNESS * grab
            const angle = this.#turnTowards(this.#target)

            this.#acceleration.copyFrom(this.#turn).scaleInPlace(stiffness * angle)
            this.#spin.subtractToRef(this.#targetSpin, this.#relative)
            this.#acceleration.subtractInPlace(this.#relative.scaleInPlace(2 * Math.sqrt(stiffness)))

            const speed = this.#spin.length()
            if(speed >= MAX_SPEED){
                const pushing = Vector3.Dot(this.#acceleration, this.#spin) / speed
                if(pushing > 0) this.#acceleration.subtractInPlace(this.#spin.scale(pushing / speed))
            }

            this.#spin.addInPlace(this.#acceleration.scaleInPlace(step))
        }
        else this.#spin.scaleInPlace(Math.max(0, 1 - DAMPING * step))

        this.#spin.subtractInPlace(this.#axis.scale(Vector3.Dot(this.#spin, this.#axis)))

        const speed = this.#spin.length()
        if(speed === 0) return

        Quaternion.RotationAxisToRef(this.#spin.scale(1 / speed), speed * step, this.#rotation)
        this.#axis.rotateByQuaternionToRef(this.#rotation, this.#axis)
        this.#axis.normalize()
    }

    /**
     * Read how far the staff is from a direction: the angle, returned, and the axis to turn it
     * around, left in {@link #turn}.
     * A direction right behind the staff gives no axis of its own, so any one across the staff is taken.
     */
    #turnTowards(direction: Vector3): number {
        Vector3.CrossToRef(this.#axis, direction, this.#turn)
        const sine = this.#turn.length()
        const angle = Math.atan2(sine, Vector3.Dot(this.#axis, direction))
        if(sine > 1e-6){
            this.#turn.scaleInPlace(1 / sine)
            return angle
        }
        if(angle < Math.PI / 2) return 0

        const pointer = this.#context.controller.pointer
        Vector3.CrossToRef(this.#axis, pointer.up, this.#turn)
        if(this.#turn.lengthSquared() < 1e-12) Vector3.CrossToRef(this.#axis, pointer.right, this.#turn)
        this.#turn.normalize()
        return angle
    }

    /** Lay both ends of the staff on either side of the hand. */
    #placeEnds(): void {
        const origin = this.#context.controller.pointer.origin
        this.#backward.copyFrom(this.#axis).scaleInPlace(-1)
        this.#headPosition.copyFrom(this.#axis).scaleInPlace(LENGTH / 2).addInPlace(origin)
        this.#footPosition.copyFrom(this.#backward).scaleInPlace(LENGTH / 2).addInPlace(origin)
    }

    /** Lay the staff across the hand, along its direction. */
    #show(): void {
        this.#staff.position.copyFrom(this.#context.controller.pointer.origin)
        Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, this.#axis, this.#staff.rotationQuaternion!)
    }

}

/** The kind of the hand twirling a bo staff. */
export const STAFF_TOOL_KIND: ToolKind = {
    label: "Bo staff",
    description: "A staff spinning freely in the hand, gripped by the grab, whose two ends strike instruments.",
    thumbnail: THUMBNAIL_URL,
    tags: ["playing", "contact", "percussive", "staff", "physic", "weapon", "spin"],
    create: context => new StaffTool(context),
}
