// The bridge between a hand and the instruments: a point of matter moved by the hand each frame.

import { AbstractMesh, BoundingBox, Color3, CreateIcoSphere, Mesh, Observer, Ray, Scene, StandardMaterial, Vector3 } from "@babylonjs/core"
import { ControllerInput, PressableInput } from "../../../xr/inputs"
import { InstrumentInteractionSystem, Interactor } from "../../../instrument"
import { PressActivation } from "./PressActivation"

/** How far ahead of the point a mesh is designated, in meters. */
const AIM_REACH = 0.3

/** The color of the ball itself, shown wherever the point is whether it presses or not. */
const BASE_COLOR = new Color3(0.85, 0.85, 0.9)

/** The color of the halo showing that the point presses. */
const GLOW_COLOR = new Color3(0.3, 1, 0.4)

/** How much wider than the point the halo is, so it reads as a glow around it and not as the ball itself. */
const GLOW_SCALE = 1.6

/** The opacity of the halo of a fully pressed point. */
const GLOW_ALPHA = 0.55

/** The fraction of the new velocity kept each frame. Below 1, so the reading is smoothed. */
const VELOCITY_RATE = 0.5

/** The longest frame the velocity is read from, in seconds. A longer one is a hitch, not a gesture. */
const MAX_STEP = 0.1

/** What a {@link PointDriver} is made of. */
export interface PointDriverOptions {

    /** A human readable prefix of the identity of the interactor, for reading logs. */
    label: string

    /** The scene the point moves in. */
    scene: Scene

    /** The controller shaken when the point is felt. A point that cannot be felt leaves it out. */
    controller?: ControllerInput

    /**
     * The button pressing the point, which activates whatever it touches.
     * @defaultValue the trigger of {@link controller}, so a hand says nothing to be played as usual.
     */
    activator?: PressableInput

    /** The radius of the point, in meters. A point of matter is a ball, never a mathematical point. */
    radius: number

    /** Where the point is now, in world space. Read once per frame, and never kept. */
    position: () => Vector3

    /** Where the point looks, in world space, for what it designates ahead of itself. */
    direction: () => Vector3

    /**
     * Does the point meet matter at all? A point that does not is carried around and pressed, but
     * touches and designates nothing.
     * @defaultValue true
     */
    hittable?: boolean

    /**
     * Is the ball itself shown? The halo of the pressure is shown whatever this says.
     * @defaultValue true
     */
    baseVisible?: boolean

}

/**
 * A ball of matter moved by a hand, stating what it sweeps through.
 *
 * @remarks
 * The detection lives here rather than in the interaction system, which detects nothing: how a point
 * meets a mesh is the business of whoever moves it. A ball moving fast crosses a thin mesh entirely
 * within one frame, so the touch is looked for along the segment travelled since the last frame
 * rather than at the position of the moment, which is what keeps a fast strike from going through a
 * drum skin unheard.
 *
 * A touch stays open while the ball remains in the box of the mesh it entered, so a stick resting on
 * a skin keeps holding it, and closes as soon as the ball leaves that box.
 *
 * The trigger of the controller presses the ball, which activates whatever it touches, and a green
 * halo on the ball says so. The halo belongs here rather than to the hands, so every hand moving a
 * point of matter shows the same thing at the same place, which is where the point actually is.
 * The ball itself is shown too, and a hand with a visual of its own hides it with
 * {@link baseVisible}.
 *
 * A point made not {@link hittable} keeps being moved, pressed and shown, but meets nothing: a hand
 * that is not meant to play the instruments still carries a point of matter, so that whatever
 * looks for one finds it.
 */
export class PointDriver {


    /** The point of matter, published to the instruments. */
    public readonly interactor: Interactor

    constructor(options: PointDriverOptions){
        this.#options = options

        const controller = options.controller
        this.interactor = InstrumentInteractionSystem.getInstance().createInteractor(
            options.label,
            controller === undefined ? undefined : (strength, duration) => controller.pulse(strength, duration),
        )

        const activator = options.activator ?? controller?.trigger
        this.#activation = activator === undefined ? undefined : new PressActivation(this.interactor, activator)

        const material = new StandardMaterial(`${options.label} glow`, options.scene)
        material.diffuseColor = Color3.Black()
        material.emissiveColor = GLOW_COLOR
        material.disableLighting = true
        material.alpha = 0
        this.#glowMaterial = material

        this.#glow = CreateIcoSphere(`${options.label} glow`, { radius: options.radius * GLOW_SCALE, subdivisions: 2 }, options.scene)
        this.#glow.isPickable = false
        this.#glow.material = material
        this.#glow.setEnabled(false)

        const baseMaterial = new StandardMaterial(`${options.label} base`, options.scene)
        baseMaterial.diffuseColor = BASE_COLOR
        this.#baseMaterial = baseMaterial

        this.#base = CreateIcoSphere(`${options.label} base`, { radius: options.radius, subdivisions: 2 }, options.scene)
        this.#base.isPickable = false
        this.#base.material = baseMaterial

        this.#hittable = options.hittable ?? true
        this.baseVisible = options.baseVisible ?? true

        this.#previous = options.position().clone()
        this.#observer = options.scene.onBeforeRenderObservable.add(() => this.#update())
    }

    public dispose(): void {
        this.#options.scene.onBeforeRenderObservable.remove(this.#observer)
        this.interactor.dispose()
        this.#glow.dispose()
        this.#glowMaterial.dispose()
        this.#base.dispose()
        this.#baseMaterial.dispose()
    }

    /** Does the point meet matter? Made false, it lets go of whatever it touched or designated. */
    public get hittable(): boolean { return this.#hittable }

    public set hittable(hittable: boolean) {
        this.#hittable = hittable
        if(hittable === true) return
        this.interactor.clearTouch()
        this.interactor.clearAim()
    }

    /** Is the ball itself shown? The halo of the pressure is shown whatever this says. */
    public get baseVisible(): boolean { return this.#base.isVisible }

    public set baseVisible(visible: boolean) { this.#base.isVisible = visible }


    readonly #options: PointDriverOptions

    readonly #observer: Observer<Scene>

    /** The button pressing the point, none when nothing can press it. */
    readonly #activation?: PressActivation

    /** The halo showing that the point presses, laid on the point itself. */
    readonly #glow: Mesh

    readonly #glowMaterial: StandardMaterial

    /** The ball itself, laid on the point. */
    readonly #base: Mesh

    readonly #baseMaterial: StandardMaterial

    #hittable: boolean

    /** The position of the point at the previous frame, the start of the segment swept. */
    readonly #previous: Vector3

    /** Scratch vector for the travel of the frame, so moving the point allocates nothing. */
    readonly #travel = new Vector3()

    /** Move the point, then state what it sweeps through, what it looks at and how hard it presses. */
    #update(): void {
        const scene = this.#options.scene
        const current = this.#options.position()

        current.subtractToRef(this.#previous, this.#travel)
        this.#readVelocity(scene.getEngine().getDeltaTime() / 1000)

        if(this.#hittable === true) this.#sweep(current)
        this.#previous.copyFrom(current)

        if(this.#hittable === true) this.#aim(current)

        // After the sweep, so a point that entered the matter this very frame presses on it at once.
        this.#activation?.update()
        this.#show(current)
    }

    /** Lay the halo on the point, as bright as the point presses and gone when it presses on nothing. */
    #show(current: Vector3): void {
        this.#base.position.copyFrom(current)

        const value = this.interactor.activationValue

        this.#glow.setEnabled(value > 0)
        if(value === 0) return

        this.#glow.position.copyFrom(current)
        this.#glowMaterial.alpha = GLOW_ALPHA * value
    }

    /**
     * Read the speed of the gesture from the travel of the frame.
     * The reading is smoothed, since the pose of a controller jitters and a raw reading would make
     * a still hand strike.
     */
    #readVelocity(step: number): void {
        if(step <= 0 || step > MAX_STEP) return

        const velocity = this.interactor.velocity
        velocity.scaleInPlace(1 - VELOCITY_RATE)
        velocity.addInPlace(this.#travel.scale(VELOCITY_RATE / step))
    }

    /** State what the ball met along the segment it travelled, and what it is still engaged in. */
    #sweep(current: Vector3): void {
        const radius = this.#options.radius
        const distance = this.#travel.length()

        if(distance > 0){
            const direction = this.#travel.scale(1 / distance)
            const pick = this.#pick(this.#previous, direction, distance + radius)
            if(pick !== null){
                this.interactor.setTouch(pick.mesh, pick.point, pick.normal)
                return
            }
        }

        const touched = this.interactor.touchedMesh
        if(touched === null) return

        // Nothing was met, so the ball either stays in the matter it entered, or has left it.
        if(PointDriver.#reaches(touched, current, radius) === false) this.interactor.clearTouch()
    }

    /** State the mesh the point designates ahead of itself, none when it looks at nothing close enough. */
    #aim(current: Vector3): void {
        if(this.interactor.touchedMesh !== null) return

        const pick = this.#pick(current, this.#options.direction(), AIM_REACH)
        if(pick === null) this.interactor.clearAim()
        else this.interactor.setAim(pick.mesh, pick.point)
    }

    /** The first mesh met along a ray, none when it meets nothing. */
    #pick(origin: Vector3, direction: Vector3, length: number): { mesh: AbstractMesh, point: Vector3, normal: Vector3 } | null {
        const ray = new Ray(origin, direction, length)
        const pick = this.#options.scene.pickWithRay(ray, mesh => PointDriver.#isSolid(mesh))

        if(pick?.hit !== true || pick.pickedMesh === null) return null

        return {
            mesh: pick.pickedMesh,
            point: pick.pickedPoint ?? origin,
            normal: pick.getNormal(true) ?? direction.scale(-1),
        }
    }

    /** Is the mesh a piece of matter the point can meet? */
    static #isSolid(mesh: AbstractMesh): boolean {
        return mesh.isPickable === true && mesh.isVisible === true && mesh.isEnabled() === true
    }

    /**
     * Does the ball still reach the box of the mesh?
     *
     * @remarks
     * The whole ball counts, not its middle: a touch opens as soon as the sweep meets a face within
     * a radius ahead, so a ball whose middle is still outside is already in contact. Asking the
     * middle to be inside closed such a touch on the very next frame, which made a hand approaching
     * slowly press and release over and over instead of resting on the mesh.
     *
     * The box is enough here: it only decides whether a touch already opened goes on.
     */
    static #reaches(mesh: AbstractMesh, point: Vector3, radius: number): boolean {
        if(mesh.isDisposed() === true) return false

        const box = mesh.getBoundingInfo().boundingBox
        return BoundingBox.IntersectsSphere(box.minimumWorld, box.maximumWorld, point, radius)
    }

}
