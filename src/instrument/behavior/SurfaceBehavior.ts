import { AbstractMesh, Behavior, Nullable, Vector3 } from "@babylonjs/core"
import { InstrumentInteractionSystem, InstrumentTouchEvent } from "../InstrumentInteractionSystem"

/** Where a point lies on the mesh it touches. */
export interface SurfaceSpot {

    /** The identity of the touching interactor. */
    readonly id: string

    /** The point in the box of the mesh, each axis between 0 and 1. */
    readonly normalized: Vector3

    /** How close to the rim the point is, 0 at the middle of the face and 1 on its edge. */
    readonly borderness: number

    /** The touch the spot was read from. */
    readonly event: InstrumentTouchEvent

}

/** What a {@link SurfaceBehavior} is made of. */
export interface SurfaceOptions {

    /** Called when a point lands on the mesh. */
    onEnter?: (spot: SurfaceSpot) => void

    /** Called whenever a point moves on the mesh, its landing included. */
    onMove: (spot: SurfaceSpot) => void

    /** Called when a point leaves the mesh, detaching included. */
    onExit?: (spot: SurfaceSpot) => void

}

/**
 * A mesh that hears where it is touched, not only that it is.
 *
 * @remarks
 * The reading is taken in the box of the mesh, so it follows the mesh wherever it goes and whatever
 * its size. {@link SurfaceSpot.borderness} is measured on the two widest axes only: the thickness of
 * a drum skin or of a plate says nothing about being near the rim, and counting it would make the
 * middle of the skin read as an edge.
 *
 * It carries no sound of its own: a drum is a {@link StrikeBehavior} for the blow and this one for
 * where the blow landed.
 *
 * @public
 */
export class SurfaceBehavior implements Behavior<AbstractMesh> {

    public attachedNode: Nullable<AbstractMesh> = null

    constructor(private readonly options: SurfaceOptions){}

    public get name(): string { return this.constructor.name }

    public init(): void {}

    public attach(target: AbstractMesh): void {
        this.detach()
        this.attachedNode = target

        const interaction = InstrumentInteractionSystem.getInstance()
        this.#observers.push(
            interaction.onTouch.add(event => {
                if(event.mesh !== target) return
                const spot = this.#spotOf(event)
                this.#spots.set(event.id, spot)
                this.options.onEnter?.(spot)
                this.options.onMove(spot)
            }),
            interaction.onTouchMove.add(event => {
                if(event.mesh !== target) return
                if(this.#spots.has(event.id) === false) return
                const spot = this.#spotOf(event)
                this.#spots.set(event.id, spot)
                this.options.onMove(spot)
            }),
            interaction.onUntouch.add(event => {
                if(event.mesh !== target) return
                const spot = this.#spots.get(event.id)
                if(spot === undefined) return
                this.#spots.delete(event.id)
                this.options.onExit?.(spot)
            }),
        )
    }

    public detach(): void {
        this.#observers.forEach(observer => observer.remove())
        this.#observers.length = 0
        this.attachedNode = null

        const spots = [...this.#spots.values()]
        this.#spots.clear()
        spots.forEach(spot => this.options.onExit?.(spot))
    }

    readonly #spots = new Map<string, SurfaceSpot>()

    readonly #observers: { remove(): void }[] = []

    /** Read where the touch lies in the box of the mesh it landed on. */
    #spotOf(event: InstrumentTouchEvent): SurfaceSpot {
        const box = event.mesh.getBoundingInfo().boundingBox
        const size = box.maximum.subtract(box.minimum)
        const axes = [size.x, size.y, size.z]

        const normalized = new Vector3(
            ratio(event.local.x - box.minimum.x, size.x),
            ratio(event.local.y - box.minimum.y, size.y),
            ratio(event.local.z - box.minimum.z, size.z),
        )

        const thinnest = axes.indexOf(Math.min(...axes))
        const spread = [normalized.x, normalized.y, normalized.z]
            .filter((_, axis) => axis !== thinnest)
            .map(value => Math.abs(value - 0.5) * 2)

        return { id: event.id, normalized, borderness: Math.max(...spread), event }
    }

}

/**
 * Where a length falls in a span, between 0 and 1.
 * A span of no thickness reads as its middle, since no point of it is nearer an edge than another.
 */
function ratio(offset: number, span: number): number {
    if(span === 0) return 0.5
    return Math.min(1, Math.max(0, offset / span))
}
