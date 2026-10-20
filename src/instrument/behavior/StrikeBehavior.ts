import { AbstractMesh, Behavior, Nullable } from "@babylonjs/core"
import { InstrumentInteractionSystem, InstrumentAimEvent, InstrumentTouchEvent, touchForce } from "../InstrumentInteractionSystem"
import { AimBehavior } from "./AimBehavior"

/** The shortest delay between two strikes of a same interactor, in milliseconds. */
const DEBOUNCE = 60

/** The force under which a touch is a brush rather than a strike. */
const MIN_FORCE = 0.05

/** What a {@link StrikeBehavior} is made of. */
export interface StrikeOptions {

    /**
     * Called once per blow.
     * @param force - How hard the blow drove in, 1 being the ordinary gesture. Never capped: a blow
     * twice as hard as usual reads as 2, and what to make of it belongs to the instrument.
     */
    onHit: (force: number, event: InstrumentTouchEvent) => void

    /** Called when the mesh starts being designated by anyone. */
    onEnter?: (event: InstrumentAimEvent) => void

    /** Called when the mesh stops being designated by anyone. */
    onExit?: () => void

    /**
     * The shortest delay between two blows of a same interactor, in milliseconds.
     * It swallows the bounce of a stick that leaves and enters the matter again in the same gesture.
     * @defaultValue 60
     */
    debounce?: number

    /**
     * The force under which a touch is ignored.
     * It drops the point that grazes the surface sideways or that is already on its way out.
     * @defaultValue 0.05
     */
    minForce?: number

}

/**
 * A mesh that sounds on the blow itself, and no longer once it is struck.
 *
 * @remarks
 * A drum knows nothing of how long the stick stays on the skin: what it hears is the entry, its
 * force and nothing else. The behavior therefore listens to the entry alone and ignores the rest of
 * the touch, which is what keeps a stick resting on the skin from sounding again.
 *
 * @public
 */
export class StrikeBehavior implements Behavior<AbstractMesh> {

    public attachedNode: Nullable<AbstractMesh> = null

    constructor(private readonly options: StrikeOptions){
        this.#aim = new AimBehavior({ onEnter: options.onEnter, onExit: options.onExit })
    }

    public get name(): string { return this.constructor.name }

    public init(): void {}

    public attach(target: AbstractMesh): void {
        this.detach()
        this.attachedNode = target
        this.#aim.attach(target)

        const debounce = this.options.debounce ?? DEBOUNCE
        const minForce = this.options.minForce ?? MIN_FORCE

        const interaction = InstrumentInteractionSystem.getInstance()
        this.#observers.push(
            interaction.onTouch.add(event => {
                if(event.mesh !== target) return

                const force = touchForce(event)
                if(force < minForce) return

                const now = performance.now()
                const last = this.#lastHits.get(event.id) ?? -Infinity
                if(now - last < debounce) return

                this.#lastHits.set(event.id, now)
                this.options.onHit(force, event)
            }),
        )
    }

    public detach(): void {
        this.#observers.forEach(observer => observer.remove())
        this.#observers.length = 0
        this.attachedNode = null
        this.#lastHits.clear()
        this.#aim.detach()
    }

    readonly #aim: AimBehavior

    /** When each interactor last landed a blow, to swallow its bounce. */
    readonly #lastHits = new Map<string, number>()

    readonly #observers: { remove(): void }[] = []

}
