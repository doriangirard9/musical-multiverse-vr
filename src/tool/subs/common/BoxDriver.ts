// The bridge between a hand and the instruments: a box of matter moved by the hand each frame.

import { AbstractMesh, Color3, CreateBox, Matrix, Mesh, Observer, Quaternion, Ray, Scene, StandardMaterial, Vector3 } from "@babylonjs/core"
import { ControllerInput, PressableInput } from "../../../xr/inputs"
import { InstrumentInteractionSystem, Interactor } from "../../../instrument"
import { PressActivation } from "./PressActivation"

/** How far ahead of the box a mesh is designated, in meters, counted from the face of the box. */
const AIM_REACH = 0.3

/** The color of the box itself, shown wherever the box is whether it presses or not. */
const BASE_COLOR = new Color3(0.85, 0.85, 0.9)

/** The color of the halo showing that the box presses. */
const GLOW_COLOR = new Color3(0.3, 1, 0.4)

/** How much wider than the box the halo is, so it reads as a glow around it and not as the box itself. */
const GLOW_SCALE = 1.3

/** The opacity of the halo of a fully pressed box. */
const GLOW_ALPHA = 0.55

/** The fraction of the new velocity kept each frame. Below 1, so the reading is smoothed. */
const VELOCITY_RATE = 0.5

/** The longest frame the velocity is read from, in seconds. A longer one is a hitch, not a gesture. */
const MAX_STEP = 0.1

/** What a {@link BoxDriver} is made of. */
export interface BoxDriverOptions {

    /** A human readable prefix of the identity of the interactor, for reading logs. */
    label: string

    /** The scene the box moves in. */
    scene: Scene

    /** The controller shaken when the box is felt. A box that cannot be felt leaves it out. */
    controller?: ControllerInput

    /**
     * The button pressing the box, which activates whatever it touches.
     * @defaultValue the trigger of {@link controller}, so a hand says nothing to be played as usual.
     */
    activator?: PressableInput

    /** The full extents of the box along its own axes, in meters. */
    size: Vector3

    /** Where the center of the box is now, in world space. Read once per frame, and never kept. */
    position: () => Vector3

    /** How the box is turned, in world space. Read once per frame, and never kept. */
    rotation: () => Quaternion

    /** Where the box looks, in world space, for what it designates ahead of itself. */
    direction: () => Vector3

    /**
     * Does the box meet matter at all? A box that does not is carried around and pressed, but
     * touches and designates nothing.
     * @defaultValue true
     */
    hittable?: boolean

    /**
     * Is the box itself shown? The halo of the pressure is shown whatever this says.
     * @defaultValue true
     */
    baseVisible?: boolean

}

/**
 * A box of matter moved by a hand, stating what it overlaps.
 *
 * @remarks
 * The sibling of `PointDriver` for a hand whose matter is a volume rather than a ball: a key, a
 * mallet head, a hand itself. A box is not swept along its travel the way a ball is: it is large
 * enough to stay in contact with what it meets from one frame to the next, so the touch is simply
 * the first solid mesh whose box it overlaps, kept as long as the overlap lasts. Both boxes are
 * oriented ones, the box of the driver as the hand turns it and the box of the mesh as the mesh
 * turns it, so a tilted key on a tilted skin reads right.
 *
 * The trigger of the controller presses the box, which activates whatever it touches, and a green
 * halo around the box says so. The box itself is shown too, and a hand with a visual of its own
 * hides it with {@link baseVisible}.
 *
 * A box made not {@link hittable} keeps being moved, pressed and shown, but meets nothing.
 */
export class BoxDriver {


    /** The box of matter, published to the instruments. */
    public readonly interactor: Interactor

    constructor(options: BoxDriverOptions){
        this.#options = options

        const controller = options.controller
        this.interactor = InstrumentInteractionSystem.getInstance().createInteractor(
            options.label,
            controller === undefined ? undefined : (strength, duration) => controller.pulse(strength, duration),
        )

        const activator = options.activator ?? controller?.trigger
        this.#activation = activator === undefined ? undefined : new PressActivation(this.interactor, activator)

        const size = options.size
        const material = new StandardMaterial(`${options.label} glow`, options.scene)
        material.diffuseColor = Color3.Black()
        material.emissiveColor = GLOW_COLOR
        material.disableLighting = true
        material.alpha = 0
        this.#glowMaterial = material

        this.#glow = CreateBox(`${options.label} glow`, { width: size.x * GLOW_SCALE, height: size.y * GLOW_SCALE, depth: size.z * GLOW_SCALE }, options.scene)
        this.#glow.isPickable = false
        this.#glow.material = material
        this.#glow.rotationQuaternion = Quaternion.Identity()
        this.#glow.setEnabled(false)

        const baseMaterial = new StandardMaterial(`${options.label} base`, options.scene)
        baseMaterial.diffuseColor = BASE_COLOR
        this.#baseMaterial = baseMaterial

        // The base is also the hull the overlaps are read from, so it is never disabled, only hidden.
        this.#base = CreateBox(`${options.label} base`, { width: size.x, height: size.y, depth: size.z }, options.scene)
        this.#base.isPickable = false
        this.#base.material = baseMaterial
        this.#base.rotationQuaternion = Quaternion.Identity()

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

    /** Does the box meet matter? Made false, it lets go of whatever it touched or designated. */
    public get hittable(): boolean { return this.#hittable }

    public set hittable(hittable: boolean) {
        this.#hittable = hittable
        if(hittable === true) return
        this.interactor.clearTouch()
        this.interactor.clearAim()
    }

    /** Is the box itself shown? The halo of the pressure is shown whatever this says. */
    public get baseVisible(): boolean { return this.#base.isVisible }

    public set baseVisible(visible: boolean) { this.#base.isVisible = visible }


    readonly #options: BoxDriverOptions

    readonly #observer: Observer<Scene>

    /** The button pressing the box, none when nothing can press it. */
    readonly #activation?: PressActivation

    /** The halo showing that the box presses, laid around the box itself. */
    readonly #glow: Mesh

    readonly #glowMaterial: StandardMaterial

    /** The box itself, and the hull its overlaps are read from. */
    readonly #base: Mesh

    readonly #baseMaterial: StandardMaterial

    #hittable: boolean

    /** The position of the box at the previous frame, for the velocity. */
    readonly #previous: Vector3

    /** Scratch vector for the travel of the frame, so moving the box allocates nothing. */
    readonly #travel = new Vector3()

    /** Scratch vector for the point of a touch. */
    readonly #point = new Vector3()

    /** Scratch vector for the normal of a touch. */
    readonly #normal = new Vector3()

    /** Scratch matrix for the world to local conversion of the center of the box. */
    readonly #inverse = Matrix.Identity()

    /** Scratch vector for the center of the box in the space of the mesh it meets. */
    readonly #local = new Vector3()

    /** Move the box, then state what it overlaps, what it looks at and how hard it presses. */
    #update(): void {
        const scene = this.#options.scene
        const current = this.#options.position()
        const rotation = this.#options.rotation()

        current.subtractToRef(this.#previous, this.#travel)
        this.#readVelocity(scene.getEngine().getDeltaTime() / 1000)
        this.#previous.copyFrom(current)

        this.#base.position.copyFrom(current)
        this.#base.rotationQuaternion!.copyFrom(rotation)
        this.#base.computeWorldMatrix(true)

        if(this.#hittable === true){
            this.#overlap(current)
            this.#aim(current)
        }

        // After the overlap, so a box that entered the matter this very frame presses on it at once.
        this.#activation?.update()
        this.#show(current, rotation)
    }

    /** Lay the halo around the box, as bright as the box presses and gone when it presses on nothing. */
    #show(current: Vector3, rotation: Quaternion): void {
        const value = this.interactor.activationValue

        this.#glow.setEnabled(value > 0)
        if(value === 0) return

        this.#glow.position.copyFrom(current)
        this.#glow.rotationQuaternion!.copyFrom(rotation)
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

    /** State the mesh the box overlaps, keeping the one it already touches as long as it still does. */
    #overlap(current: Vector3): void {
        const touched = this.interactor.touchedMesh
        if(touched !== null){
            if(BoxDriver.#isSolid(touched) && this.#base.intersectsMesh(touched, true)) return
            this.interactor.clearTouch()
        }

        for(const mesh of this.#options.scene.meshes){
            if(mesh === this.#base || mesh === this.#glow) continue
            if(!BoxDriver.#isSolid(mesh)) continue
            if(!this.#base.intersectsMesh(mesh, true)) continue

            this.#contactOf(mesh, current)
            this.interactor.setTouch(mesh, this.#point, this.#normal)
            return
        }
    }

    /**
     * Where the box meets the mesh: the point of the oriented box of the mesh nearest to the center
     * of the box, and the normal facing back from it towards that center.
     *
     * @remarks
     * The box of the mesh is taken as the mesh turns it, not as the axes of the world cut it: the
     * center is brought into the space of the mesh, clamped to the box there, and brought back. A
     * key laid on a tilted skin then meets the skin where the skin is, not the corner of the
     * upright box around it.
     */
    #contactOf(mesh: AbstractMesh, current: Vector3): void {
        const box = mesh.getBoundingInfo().boundingBox
        const min = box.minimum
        const max = box.maximum

        mesh.getWorldMatrix().invertToRef(this.#inverse)
        Vector3.TransformCoordinatesToRef(current, this.#inverse, this.#local)

        this.#local.set(
            Math.min(Math.max(this.#local.x, min.x), max.x),
            Math.min(Math.max(this.#local.y, min.y), max.y),
            Math.min(Math.max(this.#local.z, min.z), max.z),
        )
        Vector3.TransformCoordinatesToRef(this.#local, mesh.getWorldMatrix(), this.#point)

        current.subtractToRef(this.#point, this.#normal)
        if(this.#normal.lengthSquared() === 0) this.#normal.copyFrom(this.#options.direction()).scaleInPlace(-1)
        this.#normal.normalize()
    }

    /** State the mesh the box designates ahead of itself, none when it looks at nothing close enough. */
    #aim(current: Vector3): void {
        if(this.interactor.touchedMesh !== null) return

        const direction = this.#options.direction()
        const size = this.#options.size
        const reach = AIM_REACH + Math.max(size.x, size.y, size.z) / 2
        const ray = new Ray(current, direction, reach)
        const pick = this.#options.scene.pickWithRay(ray, mesh => mesh !== this.#base && mesh !== this.#glow && BoxDriver.#isSolid(mesh))

        if(pick?.hit !== true || pick.pickedMesh === null) this.interactor.clearAim()
        else this.interactor.setAim(pick.pickedMesh, pick.pickedPoint ?? current)
    }

    /** Is the mesh a piece of matter the box can meet? */
    static #isSolid(mesh: AbstractMesh): boolean {
        return mesh.isPickable === true && mesh.isVisible === true && mesh.isEnabled() === true
    }

}
