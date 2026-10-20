import { AbstractMesh, Behavior, Nullable } from "@babylonjs/core"
import { InstrumentInteractionSystem, InstrumentTouchEvent } from "../InstrumentInteractionSystem"

/** The lowest speed of entry a pluck is heard at. */
const MIN_SPEED = 0.05

/** A point that went through a mesh, from one side to the other. */
export interface Pluck {

    /** The identity of the plucking interactor. */
    readonly id: string

    /** Where along the length of the mesh it was taken, 0 at one end and 1 at the other. */
    readonly along: number

    /** How fast the point was going when it caught the mesh, 1 being the ordinary gesture. */
    readonly speed: number

    /** Which way it went through, 1 or -1 along the axis it crossed. */
    readonly direction: number

    /** Whether the point came out the other side, rather than backing out the way it came in. */
    readonly crossed: boolean

    /** The touch that caught the mesh. */
    readonly caught: InstrumentTouchEvent

    /** The touch that let it go. */
    readonly released: InstrumentTouchEvent

}

/** What a {@link PluckBehavior} is made of. */
export interface PluckOptions {

    /** Called when a point lets the mesh go, whether it went through or backed out. */
    onPluck: (pluck: Pluck) => void

    /**
     * The lowest speed of entry a pluck is heard at.
     * @defaultValue 0.05
     */
    minSpeed?: number

}

/**
 * A mesh that sounds once it is let go, not when it is caught.
 *
 * @remarks
 * A string sounds when it escapes the finger, so the event is published on the release and carries
 * the whole crossing: where along the string it was taken, how fast, which way, and whether the
 * finger really went through. A finger that backs out the way it came in still plucks, more weakly,
 * and telling the two apart belongs to the instrument.
 *
 * The length of the mesh is its widest local axis, so a string models as a long thin shape and
 * nothing has to be declared.
 *
 * @public
 */
export class PluckBehavior implements Behavior<AbstractMesh> {

    public attachedNode: Nullable<AbstractMesh> = null

    constructor(private readonly options: PluckOptions){}

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
                if(event.velocity.length() < minSpeed) return
                this.#caught.set(event.id, event)
            }),
            interaction.onUntouch.add(event => {
                if(event.mesh !== target) return
                const caught = this.#caught.get(event.id)
                if(caught === undefined) return
                this.#caught.delete(event.id)
                this.options.onPluck(pluckOf(caught, event))
            }),
        )
    }

    public detach(): void {
        this.#observers.forEach(observer => observer.remove())
        this.#observers.length = 0
        this.attachedNode = null
        this.#caught.clear()
    }

    /** The touches that caught the mesh and have not let it go yet, by interactor. */
    readonly #caught = new Map<string, InstrumentTouchEvent>()

    readonly #observers: { remove(): void }[] = []

}

/** Read a whole crossing from the touch that caught the mesh and the one that let it go. */
function pluckOf(caught: InstrumentTouchEvent, released: InstrumentTouchEvent): Pluck {
    const box = caught.mesh.getBoundingInfo().boundingBox
    const low = [box.minimum.x, box.minimum.y, box.minimum.z]
    const high = [box.maximum.x, box.maximum.y, box.maximum.z]
    const sizes = high.map((value, axis) => value - low[axis])
    const middle = high.map((value, axis) => (value + low[axis]) / 2)
    const entry = [caught.local.x, caught.local.y, caught.local.z]
    const exit = [released.local.x, released.local.y, released.local.z]

    const length = sizes.indexOf(Math.max(...sizes))
    const span = sizes[length]
    const along = span === 0 ? 0.5 : Math.min(1, Math.max(0, (entry[length] - low[length]) / span))

    const travel = exit.map((value, axis) => value - entry[axis])
    const widest = travel.map(Math.abs)
    const crossing = widest.indexOf(Math.max(...widest))

    return {
        id: caught.id,
        along,
        speed: caught.velocity.length(),
        direction: Math.sign(travel[crossing]) || 1,
        crossed: Math.sign(entry[crossing] - middle[crossing]) !== Math.sign(exit[crossing] - middle[crossing]),
        caught,
        released,
    }
}
