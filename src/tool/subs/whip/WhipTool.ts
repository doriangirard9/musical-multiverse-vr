import { Color3, CreateCylinder, CreateTube, Mesh, Observer, Quaternion, Scene, StandardMaterial, Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { PointDriver } from "../common/PointDriver"
import { SqueezeAdjust } from "../common/SqueezeAdjust"
import { WAND_TILT } from "../wand/WandTool"
import THUMBNAIL_URL from "./thumbnail.png?url"

/** The length of the lash at creation, in meters. */
const LASH = 1.2

/** The shortest and longest the lash can be made, in meters. */
const MIN_LASH = 0.4
const MAX_LASH = 2.4

/** The length added or removed at each step of the adjustment, in meters. */
const LASH_STEP = 0.1

/** How many pieces the lash is made of. Its length is shared evenly between them. */
const SEGMENTS = 24

/** The length of the handle, in meters. The lash starts at its end. */
const HANDLE = 0.25

/** The thickness of the handle, in meters. */
const HANDLE_DIAMETER = 0.03

/** The thickness of the lash where it leaves the handle and at its tip, in meters. */
const ROOT_DIAMETER = 0.022
const TIP_DIAMETER = 0.004

/** The radius of the tip as a point of matter, in meters. Wider than the lash, so a strike is not missed. */
const TIP_RADIUS = 0.02

/** The colors of the handle and of the lash. */
const HANDLE_COLOR = new Color3(0.3, 0.17, 0.08)
const LASH_COLOR = new Color3(0.55, 0.36, 0.2)

/** The pull of gravity on the lash, in meters per second squared. */
const GRAVITY = -9.81

/**
 * The mass of the tip, as a fraction of the mass of the lash at the handle.
 * This is what makes a whip crack: the wave thrown by the wrist keeps its energy as it runs down a
 * lash that gets ever lighter, so it ends in a tip moving far faster than the hand ever did.
 */
const TIP_MASS = 0.06

/** How much of its speed every piece of the lash loses each second to the air, as a fraction. */
const DAMPING = 0.6

/**
 * How hard the lash springs back straight at the handle, per second squared per meter of bend.
 * The stiffness fades towards the tip, so the handle aims the lash while the tip stays limp.
 */
const BEND = 4000

/** How fast the stiffness fades along the lash, as the power of the share of lash left. */
const BEND_FALLOFF = 2

/** How much of the bending speed the lash swallows each second, so a bend does not ring. */
const BEND_DAMPING = 3

/**
 * How many times the length of every piece is enforced per step.
 * The pieces are rigid: too few passes and the lash stretches like rubber under a hard swing.
 */
const ITERATIONS = 8

/**
 * The longest step the lash is integrated over, in seconds.
 * The tip is light and fast, so a long step lets it jump through a whole bend at once.
 */
const MAX_SUBSTEP = 1 / 480

/** The longest frame the lash is integrated over, in seconds. A longer one is a hitch, not a gesture. */
const MAX_STEP = 0.1

/**
 * The hand cracking a whip: a handle, and a lash hanging from it whose tip plays whatever it hits.
 *
 * @remarks
 * The lash is a chain of rigid pieces, each lighter than the one before. A flick of the wrist bends
 * it near the handle, the bend runs down to the tip, and the tip comes out of it faster than the
 * hand: the blow is built by the timing of the gesture more than by its strength. Only the tip
 * plays, the way only the ball of a flail does.
 *
 * Holding the squeeze and pushing the thumbstick makes the lash longer or shorter.
 */
export class WhipTool implements Tool {


    constructor(context: ToolContext){
        this.#context = context
        this.#scene = context.scene

        this.#handleMaterial = WhipTool.#materialOf(context.scene, "whip handle", HANDLE_COLOR)
        this.#lashMaterial = WhipTool.#materialOf(context.scene, "whip lash", LASH_COLOR)

        this.#handle = CreateCylinder("whip handle", { diameter: HANDLE_DIAMETER, height: HANDLE, tessellation: 12 }, context.scene)
        this.#handle.isPickable = false
        this.#handle.material = this.#handleMaterial
        this.#handle.rotationQuaternion = new Quaternion()

        for(let index = 0; index <= SEGMENTS; index++){
            const share = 1 - (1 - TIP_MASS) * index / SEGMENTS
            this.#weights.push(index === 0 ? 0 : 1 / share)
            this.#bends.push(Math.pow(1 - index / SEGMENTS, BEND_FALLOFF))
            this.#positions.push(new Vector3())
            this.#previous.push(new Vector3())
            this.#velocities.push(new Vector3())
            this.#accelerations.push(new Vector3())
        }

        this.#readGrip()
        this.#lastRoot.copyFrom(this.#root)
        for(let index = 0; index <= SEGMENTS; index++){
            this.#positions[index].copyFrom(this.#root)
            this.#positions[index].y -= index * this.#rest
        }

        this.#lash = CreateTube("whip lash", {
            path: this.#positions,
            radiusFunction: WhipTool.#radiusAt,
            tessellation: 8,
            updatable: true,
        }, context.scene)
        this.#lash.isPickable = false
        this.#lash.material = this.#lashMaterial

        this.#adjust = new SqueezeAdjust(context.controller, {
            value: LASH,
            min: MIN_LASH,
            max: MAX_LASH,
            step: LASH_STEP,
            onChange: lash => { this.#length = lash },
        })

        this.#driver = new PointDriver({
            label: `whip ${context.side}`,
            scene: context.scene,
            controller: context.controller,
            radius: TIP_RADIUS,
            position: () => this.#positions[SEGMENTS],
            direction: () => this.#tipDirection,
            baseVisible: false,
        })

        this.#observer = context.scene.onAfterPhysicsObservable.add(() => this.#update())
    }

    public dispose(): void {
        this.#scene.onAfterPhysicsObservable.remove(this.#observer)
        this.#driver.dispose()
        this.#adjust.dispose()
        this.#handle.dispose()
        this.#lash.dispose()
        this.#handleMaterial.dispose()
        this.#lashMaterial.dispose()
    }


    readonly #context: ToolContext

    readonly #scene: Scene

    readonly #handle: Mesh

    readonly #lash: Mesh

    readonly #handleMaterial: StandardMaterial

    readonly #lashMaterial: StandardMaterial

    readonly #adjust: SqueezeAdjust

    readonly #driver: PointDriver

    readonly #observer: Observer<Scene>

    /** The length of the whole lash, in meters. */
    #length = LASH

    /** The length of one piece of the lash, in meters. */
    get #rest(): number { return this.#length / SEGMENTS }

    /** The inverse of the mass of every point of the lash, the first held by the handle and so weightless. */
    readonly #weights: number[] = []

    /** How stiff the lash is at every point, as a share of {@link BEND}. */
    readonly #bends: number[] = []

    /** Where every point of the lash is, in world space, from the handle to the tip. */
    readonly #positions: Vector3[] = []

    /** Where every point was before the current step, to read back the speed the constraints gave it. */
    readonly #previous: Vector3[] = []

    /** How fast every point moves, in meters per second. */
    readonly #velocities: Vector3[] = []

    /** Scratch for the acceleration of every point, so integrating allocates nothing. */
    readonly #accelerations: Vector3[] = []

    /** Where the hand holds the handle, in world space, read once per frame. */
    readonly #grip = new Vector3()

    /** The direction the handle points to, read once per frame. */
    readonly #aim = new Vector3()

    /** Where the lash leaves the handle, at the end of the frame. */
    readonly #root = new Vector3()

    /** Where the lash left the handle at the end of the previous frame. */
    readonly #lastRoot = new Vector3()

    /** Scratch vectors, so swinging the lash each frame allocates nothing. */
    readonly #offset = new Vector3()
    readonly #target = new Vector3()
    readonly #relative = new Vector3()
    readonly #tipDirection = new Vector3(0, -1, 0)

    /** Read where the hand holds the handle and where it points: up from the hand, the way a wand is held. */
    #readGrip(): void {
        const pointer = this.#context.controller.pointer
        this.#grip.copyFrom(pointer.origin)
        this.#aim.copyFrom(pointer.forward).scaleInPlace(Math.cos(WAND_TILT))
        this.#aim.addInPlace(pointer.up.scale(Math.sin(WAND_TILT)))
        this.#aim.normalize()
        this.#root.copyFrom(this.#aim).scaleInPlace(HANDLE).addInPlace(this.#grip)
    }

    /** Swing the lash for the length of the frame, then lay the handle and the lash where they went. */
    #update(): void {
        this.#readGrip()

        const step = this.#scene.getEngine().getDeltaTime() / 1000
        if(step > 0 && step <= MAX_STEP){
            const count = Math.ceil(step / MAX_SUBSTEP)
            const substep = step / count
            this.#root.subtractToRef(this.#lastRoot, this.#velocities[0]).scaleInPlace(1 / step)
            for(let index = 1; index <= count; index++){
                Vector3.LerpToRef(this.#lastRoot, this.#root, index / count, this.#positions[0])
                this.#swingBy(substep)
            }
        }
        else this.#positions[0].copyFrom(this.#root)

        this.#lastRoot.copyFrom(this.#root)
        this.#show()
    }

    /**
     * Integrate the lash over one step.
     *
     * Gravity, the air and the stiffness of the lash change the speed of every point, and the speed
     * moves it. The length of every piece is then enforced, the lighter end of a piece giving way
     * more than the heavier one, and the speed is read back from where the point actually went, so
     * what the constraints took or gave is kept as motion.
     *
     * @param step - The length of the step, in seconds.
     */
    #swingBy(step: number): void {
        const positions = this.#positions
        const velocities = this.#velocities
        const accelerations = this.#accelerations
        const weights = this.#weights
        const rest = this.#rest

        for(let index = 1; index <= SEGMENTS; index++) accelerations[index].set(0, GRAVITY, 0)

        for(let index = 1; index <= SEGMENTS; index++){
            if(index === 1) this.#target.copyFrom(this.#aim)
            else positions[index - 1].subtractToRef(positions[index - 2], this.#target).normalize()
            this.#target.scaleInPlace(rest).addInPlace(positions[index - 1])

            this.#target.subtractToRef(positions[index], this.#offset).scaleInPlace(BEND * this.#bends[index])
            velocities[index].subtractToRef(velocities[index - 1], this.#relative)
            this.#offset.subtractInPlace(this.#relative.scaleInPlace(BEND_DAMPING))

            accelerations[index].addInPlace(this.#offset.scale(weights[index]))
            accelerations[index - 1].subtractInPlace(this.#offset.scaleInPlace(weights[index - 1]))
        }

        const air = Math.max(0, 1 - DAMPING * step)
        for(let index = 1; index <= SEGMENTS; index++){
            velocities[index].addInPlace(accelerations[index].scaleInPlace(step)).scaleInPlace(air)
            this.#previous[index].copyFrom(positions[index])
            positions[index].addInPlace(velocities[index].scale(step))
        }

        for(let iteration = 0; iteration < ITERATIONS; iteration++){
            for(let index = 1; index <= SEGMENTS; index++) this.#holdLength(index - 1, index, rest)
        }

        for(let index = 1; index <= SEGMENTS; index++){
            positions[index].subtractToRef(this.#previous[index], velocities[index]).scaleInPlace(1 / step)
        }
    }

    /** Bring two neighbouring points back to the length of a piece, each moving as little as it weighs. */
    #holdLength(first: number, second: number, rest: number): void {
        const a = this.#positions[first]
        const b = this.#positions[second]
        const total = this.#weights[first] + this.#weights[second]

        b.subtractToRef(a, this.#offset)
        const length = this.#offset.length()
        if(length === 0 || total === 0) return

        this.#offset.scaleInPlace((length - rest) / length / total)
        a.addInPlace(this.#offset.scale(this.#weights[first]))
        b.subtractInPlace(this.#offset.scaleInPlace(this.#weights[second]))
    }

    /** Lay the handle in the hand, the lash along its points, and read where the tip looks. */
    #show(): void {
        this.#handle.position.copyFrom(this.#aim).scaleInPlace(HANDLE / 2).addInPlace(this.#grip)
        Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, this.#aim, this.#handle.rotationQuaternion!)

        CreateTube("whip lash", { path: this.#positions, radiusFunction: WhipTool.#radiusAt, instance: this.#lash })

        this.#positions[SEGMENTS].subtractToRef(this.#positions[SEGMENTS - 1], this.#offset)
        const length = this.#offset.length()
        if(length > 0) this.#tipDirection.copyFrom(this.#offset).scaleInPlace(1 / length)
    }

    /** The radius of the lash at one of its points, thinning from the handle to the tip. */
    static #radiusAt(index: number): number {
        const share = index / SEGMENTS
        return (ROOT_DIAMETER + (TIP_DIAMETER - ROOT_DIAMETER) * share) / 2
    }

    static #materialOf(scene: Scene, name: string, color: Color3): StandardMaterial {
        const material = new StandardMaterial(name, scene)
        material.diffuseColor = color
        material.emissiveColor = color.scale(0.3)
        return material
    }

}

/** The kind of the hand cracking a whip. */
export const WHIP_TOOL_KIND: ToolKind = {
    label: "Whip",
    description: "A physics-based whip whose tip can strike instruments.",
    thumbnail: THUMBNAIL_URL,
    tags: ["playing", "contact", "percussive", "adjustable", "length", "whip", "physic", "weapon"],
    create: context => new WhipTool(context),
}
