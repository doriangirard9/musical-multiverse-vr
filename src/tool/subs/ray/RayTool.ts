

import { AbstractMesh, Color3, CreateIcoSphere, Mesh, Observer, Ray, Scene, StandardMaterial, Vector3 } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { InstrumentInteractionSystem, Interactor } from "../../../instrument"
import { tools } from "../../../xr/inputs"
import { PressActivation } from "../common/PressActivation"
import THUMBNAIL_URL from "./thumbnail.png?url"

/** How far the hand can reach, in meters. */
const REACH = 10

/** How deep a fully closed grab drives the point under the aimed surface, in meters. */
const MAX_DEPTH = 0.06

/** The radius of the ball showing where the point lies, in meters. */
const DOT_RADIUS = 0.012

/** The color of the ball, at rest, driven in, and pressing. */
const REST_COLOR = new Color3(0.5, 0.7, 1)
const PRESSED_COLOR = new Color3(1, 0.6, 0.3)
const ACTIVE_COLOR = new Color3(0.3, 1, 0.4)

/** The longest frame the velocity is read from, in seconds. A longer one is a hitch, not a gesture. */
const MAX_STEP = 0.1

/** The fraction of the new velocity kept each frame. Below 1, so the reading is smoothed. */
const VELOCITY_RATE = 0.5

/**
 * The hand playing from a distance: the point of matter lies on whatever the ray meets, the grab
 * drives it under the surface, and the trigger presses on what it reaches.
 *
 * @remarks
 * A hand that cannot reach an instrument still has to be able to strike it, so the gesture moves
 * from the arm to the hand: the harder the grab closes, the further the point sinks, and how fast
 * it sinks is the force of the blow. The grab reaches the matter, the trigger activates it, exactly
 * as for every other hand.
 */
export class RayTool implements Tool {


    constructor(context: ToolContext){
        this.#context = context
        this.#scene = context.scene

        this.#visual = tools.InputVisualPointer.CreateSimple(context.scene, context.controller.pointer)

        context.interactions.pointer.enable()

        const material = new StandardMaterial("ray hand dot", context.scene)
        material.diffuseColor = REST_COLOR
        material.emissiveColor = REST_COLOR
        this.#material = material

        this.#dot = CreateIcoSphere("ray hand dot", { radius: DOT_RADIUS, subdivisions: 2 }, context.scene)
        this.#dot.isPickable = false
        this.#dot.material = material
        this.#dot.setEnabled(false)

        this.#interactor = InstrumentInteractionSystem.getInstance().createInteractor(
            `ray ${context.side}`,
            (strength, duration) => context.controller.pulse(strength, duration),
        )

        this.#activation = new PressActivation(this.#interactor, context.controller.trigger)

        this.#observer = context.scene.onBeforeRenderObservable.add(() => this.#update())
    }

    public dispose(): void {
        this.#context.interactions.pointer.disable()
        this.#scene.onBeforeRenderObservable.remove(this.#observer)
        this.#interactor.dispose()
        this.#dot.dispose()
        this.#material.dispose()
        this.#visual.remove()
    }


    readonly #context: ToolContext

    readonly #scene: Scene

    readonly #visual: ReturnType<typeof tools.InputVisualPointer.CreateSimple>

    readonly #interactor: Interactor

    /** The trigger pressing the point, which activates whatever it reaches. */
    readonly #activation: PressActivation

    readonly #dot: Mesh

    readonly #material: StandardMaterial

    readonly #observer: Observer<Scene>

    /** The mesh the ray met at the previous frame, none when it met nothing. */
    #lastMesh: AbstractMesh | null = null

    /** Scratch vector for the point, so moving it allocates nothing. */
    readonly #point = new Vector3()

    /** Where the point lay at the previous frame, the start of the travel of the frame. */
    readonly #previous = new Vector3()

    /** Scratch vector for the travel of the frame, so moving the point allocates nothing. */
    readonly #travel = new Vector3()

    /**
     * Lay the point on what the ray meets, and drive it in as deep as the grab asks.
     * What the ray meets is what the pointer of the hand may pick, so the filters put on that hand
     * hold. The touch comes first, so a point reaching the matter this very frame presses on it at
     * once.
     */
    #update(): void {
        const pointer = this.#context.controller.pointer
        const ray = new Ray(pointer.origin, pointer.forward, REACH)
        const pick = this.#scene.pickWithRay(ray, mesh => pointer.isPickable(mesh))

        if(pick?.hit !== true || pick.pickedMesh === null || pick.pickedPoint === null){
            this.#release()
            return
        }

        const normal = pick.getNormal(true) ?? pointer.forward.scale(-1)
        const depth = this.#context.controller.squeeze.getValue() * MAX_DEPTH

        this.#point.copyFrom(pick.pickedPoint)
        this.#point.subtractInPlace(normal.scale(depth))
        this.#readVelocity(pick.pickedMesh)

        if(depth > 0) this.#interactor.setTouch(pick.pickedMesh, this.#point, normal)
        else {
            this.#interactor.clearTouch()
            this.#interactor.setAim(pick.pickedMesh, this.#point)
        }

        this.#activation.update()
        this.#show(depth)
    }

    /**
     * Read the speed of the gesture from how far the point actually travelled.
     * Both the hand and the arm move it: the grab sinks it under the surface, the arm sweeps it over
     * the mesh, and an instrument hears the sum of the two. Reading only how fast it sinks left a
     * hand rubbing a mesh at full speed reporting no motion at all.
     *
     * The reading is dropped whenever the point jumps rather than travels: on the frame the ray
     * lands on another mesh, or on the first frame it lands at all, since neither is a gesture.
     */
    #readVelocity(mesh: AbstractMesh): void {
        const step = this.#scene.getEngine().getDeltaTime() / 1000
        const jumped = mesh !== this.#lastMesh
        this.#lastMesh = mesh

        if(jumped || step <= 0 || step > MAX_STEP){
            this.#previous.copyFrom(this.#point)
            this.#interactor.velocity.setAll(0)
            return
        }

        this.#point.subtractToRef(this.#previous, this.#travel)
        this.#previous.copyFrom(this.#point)

        const velocity = this.#interactor.velocity
        velocity.scaleInPlace(1 - VELOCITY_RATE)
        velocity.addInPlace(this.#travel.scale(VELOCITY_RATE / step))
    }

    /**
     * Show the ball where the point lies, colored by how hard the grab drives it in and by how hard
     * the trigger presses. Pressing wins over sinking, since it is what the instrument answers to.
     */
    #show(depth: number): void {
        this.#dot.setEnabled(true)
        this.#dot.position.copyFrom(this.#point)

        const color = this.#material.emissiveColor
        Color3.LerpToRef(REST_COLOR, PRESSED_COLOR, depth / MAX_DEPTH, color)
        Color3.LerpToRef(color, ACTIVE_COLOR, this.#interactor.activationValue, color)
        this.#material.diffuseColor.copyFrom(color)
    }

    /**
     * Let go of everything: the ray meets nothing anymore.
     * The touch is dropped before the aim, since only this hand knows the point left the matter; the
     * pressure is still read, so a trigger released while pointing at nothing is not held again the
     * next time the ray lands on something.
     */
    #release(): void {
        this.#lastMesh = null
        this.#interactor.velocity.setAll(0)
        this.#interactor.clearTouch()
        this.#interactor.clearAim()
        this.#activation.update()
        this.#dot.setEnabled(false)
    }

}

/** The kind of the hand playing from a distance. */
export const RAY_TOOL_KIND: ToolKind = {
    label: "Ray",
    description: "Lays a point on whatever the hand aims at, however far. The grab drives that point under the surface, and how fast it sinks is the force of the blow.",
    thumbnail: THUMBNAIL_URL,
    tags: ["distance", "contact", "precise", "percussive"],
    create: context => new RayTool(context),
}
