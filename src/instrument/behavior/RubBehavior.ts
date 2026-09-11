import { AbstractMesh, Behavior, Nullable, Vector3 } from "@babylonjs/core"
import { InstrumentInteractionSystem, InstrumentTouchEvent } from "../InstrumentInteractionSystem"

/** The speed under which a point resting on the surface is not rubbing it. */
const MIN_SPEED = 0.02

/** A point sliding along a surface it stays in contact with. */
export interface Rub {

    /** The identity of the rubbing interactor. */
    readonly id: string

    /** How fast the point slides along the surface, in units per second. */
    readonly speed: number

    /** How far it has slid since it landed, in units. */
    readonly distance: number

    /** The touch the reading was taken from. */
    readonly event: InstrumentTouchEvent

}

/** What a {@link RubBehavior} is made of. */
export interface RubOptions {

    /** Called when a point starts sliding on the mesh. */
    onStart?: (rub: Rub) => void

    /** Called whenever a sliding point moves, its start included. */
    onRub: (rub: Rub) => void

    /** Called when a point stops sliding, whether it stood still or left the mesh, detaching included. */
    onStop?: (rub: Rub) => void

    /**
     * The speed under which a point is resting rather than rubbing, in units per second.
     * @defaultValue 0.02
     */
    minSpeed?: number

}

/**
 * A mesh that sounds as long as something slides on it, and falls silent as soon as it stops.
 *
 * @remarks
 * Only the motion along the surface counts: a stick pressing harder into a cymbal is not rubbing it,
 * a stick sweeping across it is. A point that lands and stands still therefore never starts a rub,
 * and one that stops moving ends it while still touching, which is what a bowed or brushed sound
 * needs.
 *
 * @public
 */
export class RubBehavior implements Behavior<AbstractMesh> {

    public attachedNode: Nullable<AbstractMesh> = null

    constructor(private readonly options: RubOptions){}

    public get name(): string { return this.constructor.name }

    public init(): void {}

    public attach(target: AbstractMesh): void {
        this.detach()
        this.attachedNode = target

        const minSpeed = this.options.minSpeed ?? MIN_SPEED

        const interaction = InstrumentInteractionSystem.getInstance()
        this.#observers.push(
            interaction.onTouch.add(event => {
                if(event.mesh !== target) return
                this.#points.set(event.id, event.point.clone())
                this.#distances.set(event.id, 0)
            }),
            interaction.onTouchMove.add(event => {
                if(event.mesh !== target) return

                const previous = this.#points.get(event.id)
                if(previous === undefined) return

                const travel = tangentialTravel(previous, event)
                previous.copyFrom(event.point)

                const seconds = target.getScene().getEngine().getDeltaTime() / 1000
                const speed = seconds > 0 ? travel / seconds : 0

                if(speed < minSpeed){
                    this.#stop(event)
                    return
                }

                const distance = (this.#distances.get(event.id) ?? 0) + travel
                this.#distances.set(event.id, distance)

                const rub = { id: event.id, speed, distance, event }
                if(this.#rubbing.has(event.id) === false){
                    this.#rubbing.set(event.id, rub)
                    this.options.onStart?.(rub)
                }
                else this.#rubbing.set(event.id, rub)

                this.options.onRub(rub)
            }),
            interaction.onUntouch.add(event => {
                if(event.mesh !== target) return
                this.#stop(event)
                this.#points.delete(event.id)
                this.#distances.delete(event.id)
            }),
        )
    }

    public detach(): void {
        this.#observers.forEach(observer => observer.remove())
        this.#observers.length = 0
        this.attachedNode = null

        const rubs = [...this.#rubbing.values()]
        this.#rubbing.clear()
        this.#points.clear()
        this.#distances.clear()
        rubs.forEach(rub => this.options.onStop?.(rub))
    }

    /** The rub in progress for each interactor, absent while it rests or has left. */
    readonly #rubbing = new Map<string, Rub>()

    /** Where each touching point was last seen, in world space. */
    readonly #points = new Map<string, Vector3>()

    /** How far each touching point has slid since it landed. */
    readonly #distances = new Map<string, number>()

    readonly #observers: { remove(): void }[] = []

    /** End the rub of an interactor, if it had one going. */
    #stop(event: InstrumentTouchEvent): void {
        const rub = this.#rubbing.get(event.id)
        if(rub === undefined) return
        this.#rubbing.delete(event.id)
        this.options.onStop?.({ ...rub, event })
    }

}

/** How far the point moved along the surface, the part driving into it left out. */
function tangentialTravel(previous: Vector3, event: InstrumentTouchEvent): number {
    const travel = event.point.subtract(previous)
    return travel.subtract(event.normal.scale(Vector3.Dot(travel, event.normal))).length()
}
