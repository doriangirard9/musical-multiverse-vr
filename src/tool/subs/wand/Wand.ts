import { Color3, CreateCylinder, CreateIcoSphere, Mesh, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core"

/** The thickness of the shaft of an ordinary wand, in meters. */
export const WAND_DIAMETER = 0.012

/** The radius of the striking ball of an ordinary wand, in meters. */
export const WAND_HEAD_RADIUS = 0.025

/** The color of an ordinary wand. */
export const WAND_COLOR = new Color3(0.85, 0.8, 0.75)

/** What a {@link Wand} is made of. */
export interface WandOptions {

    /** The name of the wand, worn by its meshes. */
    name: string

    /** The length of the shaft, in meters. */
    length: number

    /**
     * The thickness of the shaft, in meters.
     * @defaultValue {@link WAND_DIAMETER}
     */
    diameter?: number

    /**
     * The radius of the striking ball, in meters. Zero for a wand ending in a bare point.
     * @defaultValue {@link WAND_HEAD_RADIUS}
     */
    headRadius?: number

    /**
     * The color of the wand.
     * @defaultValue {@link WAND_COLOR}
     */
    color?: Color3

}

/**
 * A thin shaft ending in a striking ball, laid along the +Z axis of its own {@link root}.
 *
 * @remarks
 * The wand knows nothing of the hand holding it: where it is parented and how it is oriented belongs
 * to whoever holds it. Only the shape along its own axis is its business.
 *
 * A wand of no head radius wears no ball, and plays with the bare end of its shaft, which is what a
 * hand pressing rather than striking wants.
 */
export class Wand {


    /** The radius of the striking ball of an ordinary wand, in meters. */
    public static readonly HEAD_RADIUS = WAND_HEAD_RADIUS

    /** The node carrying the wand. Its holder parents and orients it. */
    public readonly root: TransformNode

    constructor(scene: Scene, options: WandOptions){
        const name = options.name
        const color = options.color ?? WAND_COLOR
        this.#length = options.length
        this.#headRadius = options.headRadius ?? WAND_HEAD_RADIUS

        this.root = new TransformNode(name, scene)

        const material = new StandardMaterial(name, scene)
        material.diffuseColor = color
        material.emissiveColor = color.scale(0.4)
        this.#material = material

        const diameter = options.diameter ?? WAND_DIAMETER
        this.#shaft = CreateCylinder(`${name} shaft`, { diameter, height: 1, subdivisions: 3 }, scene)
        this.#shaft.parent = this.root
        this.#shaft.rotation.x = Math.PI / 2
        this.#shaft.isPickable = false
        this.#shaft.material = material

        if(this.#headRadius > 0){
            this.#head = CreateIcoSphere(`${name} head`, { radius: this.#headRadius, subdivisions: 3 }, scene)
            this.#head.parent = this.root
            this.#head.isPickable = false
            this.#head.material = material
        }

        this.#place()
    }

    /** The length of the shaft, in meters. */
    public get length(): number { return this.#length }

    public set length(length: number) {
        this.#length = length
        this.#place()
    }

    /** The distance between the origin of {@link root} and the near end of the shaft, in meters. */
    public get offset(): number { return this.#offset }

    public set offset(offset: number) {
        this.#offset = offset
        this.#place()
    }

    /** The radius of the striking ball, zero for a wand ending in a bare point. */
    public get headRadius(): number { return this.#headRadius }

    /** The distance between the origin of {@link root} and the far surface of the ball, in meters. */
    public get reach(): number { return this.#offset + this.#length + this.#headRadius }

    /**
     * The point the wand plays with, in world space: the middle of the ball, or the bare end of the
     * shaft when the wand wears none.
     * @param result - The vector the point is written into, so reading it each frame allocates nothing.
     */
    public tipTo(result: Vector3): Vector3 {
        result.set(0, 0, this.#offset + this.#length)
        return Vector3.TransformCoordinatesToRef(result, this.root.computeWorldMatrix(true), result)
    }

    /**
     * The world direction the wand points to, along its own axis.
     * @param result - The vector the direction is written into, so reading it allocates nothing.
     */
    public directionTo(result: Vector3): Vector3 {
        result.set(0, 0, 1)
        Vector3.TransformNormalToRef(result, this.root.computeWorldMatrix(true), result)
        return result.normalize()
    }

    public dispose(): void {
        this.#head?.dispose()
        this.#shaft.dispose()
        this.#material.dispose()
        this.root.dispose()
    }

    readonly #shaft: Mesh

    readonly #head?: Mesh

    readonly #material: StandardMaterial

    readonly #headRadius: number

    #length: number

    #offset = 0

    /** Keep the shaft centered on the segment it represents, and the ball at its end. */
    #place(): void {
        this.#shaft.scaling.y = this.#length
        this.#shaft.position.z = this.#offset + this.#length / 2
        if(this.#head !== undefined) this.#head.position.z = this.#offset + this.#length
    }

}
