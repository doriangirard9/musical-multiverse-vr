

import { AbstractMesh, Color3, CreateCylinder, CreateTube, Mesh, Observer, Quaternion, Ray, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { InstrumentInteractionSystem, Interactor } from "../../../instrument"
import { PressActivation } from "../common/PressActivation"
import { SqueezeAdjust } from "../common/SqueezeAdjust"
import { WAND_TILT } from "../wand/WandTool"
import THUMBNAIL_URL from "./thumbnail.png?url"

/** The length of the hair at creation, in meters. */
const CORD = 0.5

/** The shortest and longest the hair can be made, in meters. */
const MIN_CORD = 0.15
const MAX_CORD = 2

/** The length added or removed at each step of the adjustment, in meters. */
const CORD_STEP = 0.05

/**
 * How far the stick bows away from the hair, as a fraction of the length of the hair.
 * A violin bow is very nearly straight: the stick arcs just enough to read as a stick held above its
 * hair, and never enough to read as the bow of an archer.
 */
const BULGE = 0.06

/** How far ahead of the hand the hair begins, in meters: where the frog of the bow is held. */
const FROG = 0.06

/** The thickness of the stick and of the hair, in meters. */
const ARCH_DIAMETER = 0.012
const CORD_DIAMETER = 0.006

/** The number of points the stick is drawn along. */
const ARCH_POINTS = 12

/** The colors of the stick and of the hair. */
const ARCH_COLOR = new Color3(0.45, 0.3, 0.2)
const CORD_COLOR = new Color3(0.95, 0.95, 0.85)

/** The fraction of the new velocity kept each frame. Below 1, so the reading is smoothed. */
const VELOCITY_RATE = 0.5

/** The longest frame the velocity is read from, in seconds. A longer one is a hitch, not a gesture. */
const MAX_STEP = 0.1

/**
 * The hand holding a violin bow: a stick held above its hair, which plays whatever the hair is drawn
 * across.
 *
 * @remarks
 * Where a wand meets the world with its end alone, the bow meets it anywhere along its hair, so a
 * mesh crossing it is played wherever the hand happens to hold it. The force is read at the spot
 * it is met, so drawing the bow lengthwise sounds as almost nothing and sweeping it across sounds
 * as the whole gesture: that is what tells a brushed sound from a struck one.
 *
 * The hair bends where it is met, so the contact is seen before it is heard.
 */
export class ArchTool implements Tool {


    constructor(context: ToolContext){
        this.#scene = context.scene

        this.#root = new TransformNode("arch", context.scene)
        this.#root.parent = context.visual
        this.#root.rotation.x = -WAND_TILT

        this.#archMaterial = ArchTool.#materialOf(context.scene, "arch", ARCH_COLOR)
        this.#cordMaterial = ArchTool.#materialOf(context.scene, "arch cord", CORD_COLOR)

        this.#segments = [0, 1].map(index => this.#createSegment(index))
        this.#buildArch()

        this.#adjust = new SqueezeAdjust(context.controller, {
            value: CORD,
            min: MIN_CORD,
            max: MAX_CORD,
            step: CORD_STEP,
            onChange: cord => { this.#cord = cord; this.#buildArch() },
        })

        this.#interactor = InstrumentInteractionSystem.getInstance().createInteractor(
            `arch ${context.side}`,
            (strength, duration) => context.controller.pulse(strength, duration),
        )

        this.#activation = new PressActivation(this.#interactor, context.controller.trigger)

        this.#readAnchors()
        this.#previous = [this.#anchors[0].clone(), this.#anchors[1].clone()]

        this.#observer = context.scene.onBeforeRenderObservable.add(() => this.#update())
    }

    public dispose(): void {
        this.#scene.onBeforeRenderObservable.remove(this.#observer)
        this.#adjust.dispose()
        this.#interactor.dispose()
        this.#arch?.dispose()
        for(const segment of this.#segments) segment.dispose()
        this.#archMaterial.dispose()
        this.#cordMaterial.dispose()
        this.#root.dispose()
    }


    readonly #scene: Scene

    /** The node carrying the arch, tilted on the hand the way a wand is held. */
    readonly #root: TransformNode

    readonly #archMaterial: StandardMaterial

    readonly #cordMaterial: StandardMaterial

    /** The two halves of the hair, so it can bend where it is met. */
    readonly #segments: Mesh[]

    readonly #adjust: SqueezeAdjust

    readonly #interactor: Interactor

    /** The trigger pressing the hair, which activates whatever it rests on. */
    readonly #activation: PressActivation

    readonly #observer: Observer<Scene>

    /** The ends of the hair, in world space, read once per frame. */
    readonly #anchors = [new Vector3(), new Vector3()]

    /** Where the ends of the hair were at the previous frame, to read its velocity. */
    readonly #previous: Vector3[]

    /** Scratch vectors, so following the string each frame allocates nothing. */
    readonly #direction = new Vector3()
    readonly #contact = new Vector3()
    readonly #before = new Vector3()

    /** The length of the hair, in meters. */
    #cord = CORD

    #arch?: Mesh

    /**
     * The ends of the hair in the space of the root: the frog, held by the hand, and the tip.
     * They lie along the way the hand points, so the bow is held the way a wand is.
     */
    get #ends(): [Vector3, Vector3] {
        return [new Vector3(0, 0, FROG), new Vector3(0, 0, FROG + this.#cord)]
    }

    /** Draw the stick, joined to the hair at both of its ends and arcing above it in between. */
    #buildArch(): void {
        this.#arch?.dispose()

        const [frog, tip] = this.#ends
        const bulge = this.#cord * BULGE
        const path = Array.from({ length: ARCH_POINTS }, (_unused, index) => {
            const ratio = index / (ARCH_POINTS - 1)
            const point = Vector3.Lerp(frog, tip, ratio)
            point.y += Math.sin(ratio * Math.PI) * bulge
            return point
        })

        this.#arch = CreateTube("arch", { path, radius: ARCH_DIAMETER / 2, tessellation: 6 }, this.#scene)
        this.#arch.parent = this.#root
        this.#arch.isPickable = false
        this.#arch.material = this.#archMaterial
    }

    /** One half of the hair, a cylinder laid on the segment it stands for. */
    #createSegment(index: number): Mesh {
        const segment = CreateCylinder(`arch cord ${index}`, { diameter: CORD_DIAMETER, height: 1, subdivisions: 1 }, this.#scene)
        segment.isPickable = false
        segment.material = this.#cordMaterial
        segment.rotationQuaternion = new Quaternion()
        return segment
    }

    /** Read where the ends of the hair are in the world, the hair being the segment between them. */
    #readAnchors(): void {
        const matrix = this.#root.computeWorldMatrix(true)
        const ends = this.#ends
        Vector3.TransformCoordinatesToRef(ends[0], matrix, this.#anchors[0])
        Vector3.TransformCoordinatesToRef(ends[1], matrix, this.#anchors[1])
    }

    /**
     * Cast the hair from the frog to the tip, and lay the point of matter where it is met.
     * The hair is never met further than it is long, however far apart its ends are read, and the
     * cast comes first so hair landing on a mesh this very frame presses on it at once.
     */
    #update(): void {
        this.#readAnchors()

        const [from, to] = this.#anchors
        to.subtractToRef(from, this.#direction)
        const spacing = this.#direction.length()
        if(spacing === 0) return
        this.#direction.scaleInPlace(1 / spacing)

        const ray = new Ray(from, this.#direction, this.#cord)
        const pick = this.#scene.pickWithRay(ray, mesh => ArchTool.#isSolid(mesh))

        if(pick?.hit !== true || pick.pickedMesh === null || pick.pickedPoint === null){
            this.#interactor.velocity.setAll(0)
            this.#interactor.clearAim()
            this.#bend(null)
        }
        else {
            this.#contact.copyFrom(pick.pickedPoint)
            const normal = pick.getNormal(true) ?? this.#direction.scale(-1)

            this.#readVelocity(Vector3.Distance(from, this.#contact) / spacing)
            this.#interactor.setTouch(pick.pickedMesh, this.#contact, normal)
            this.#bend(this.#contact)
        }

        this.#previous[0].copyFrom(this.#anchors[0])
        this.#previous[1].copyFrom(this.#anchors[1])

        this.#activation.update()
    }

    /**
     * Read how fast the hair moves where it is met.
     * The spot is taken at the same place along the hair as at the previous frame, so what is
     * measured is the motion of the hair itself and not the sliding of the contact along it.
     *
     * @param ratio - How far along the hair the contact lies, 0 at the frog and 1 at the tip.
     */
    #readVelocity(ratio: number): void {
        const step = this.#scene.getEngine().getDeltaTime() / 1000
        if(step <= 0 || step > MAX_STEP) return

        Vector3.LerpToRef(this.#previous[0], this.#previous[1], ratio, this.#before)

        const velocity = this.#interactor.velocity
        velocity.scaleInPlace(1 - VELOCITY_RATE)
        velocity.addInPlace(this.#contact.subtract(this.#before).scaleInPlace(VELOCITY_RATE / step))
    }

    /**
     * Lay the hair between its two ends, bending it at the point it is met.
     * @param contact - Where the hair is met, none when it is met nowhere and stays straight.
     */
    #bend(contact: Vector3 | null): void {
        const middle = contact ?? Vector3.Center(this.#anchors[0], this.#anchors[1])
        this.#lay(this.#segments[0], this.#anchors[0], middle)
        this.#lay(this.#segments[1], middle, this.#anchors[1])
    }

    /** Stretch one half of the hair between two points of the world. */
    #lay(segment: Mesh, from: Vector3, to: Vector3): void {
        const direction = to.subtract(from)
        const length = direction.length()

        segment.setEnabled(length > 0)
        if(length === 0) return

        segment.position.copyFrom(from).addInPlace(to).scaleInPlace(0.5)
        segment.scaling.y = length
        Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, direction.scaleInPlace(1 / length), segment.rotationQuaternion!)
    }

    static #materialOf(scene: Scene, name: string, color: Color3): StandardMaterial {
        const material = new StandardMaterial(name, scene)
        material.diffuseColor = color
        material.emissiveColor = color.scale(0.35)
        return material
    }

    /** Is the mesh a piece of matter the hair can meet? */
    static #isSolid(mesh: AbstractMesh): boolean {
        return mesh.isPickable === true && mesh.isVisible === true && mesh.isEnabled() === true
    }

}

/** The kind of the hand holding a violin bow. */
export const ARCH_TOOL_KIND: ToolKind = {
    label: "Arch",
    description: "Plays whatever its hair is drawn across, anywhere along its length, and the hair bends where it meets the matter.",
    thumbnail: THUMBNAIL_URL,
    tags: ["contact", "wide", "sustained", "adjustable"],
    create: context => new ArchTool(context),
}
