import { AbstractMesh, Behavior, Nullable } from "@babylonjs/core"
import { InstrumentInteractionSystem, InstrumentAimEvent, InstrumentTouchEvent, touchForce } from "../InstrumentInteractionSystem"
import { AimBehavior } from "./AimBehavior"

/** What a {@link HoldBehavior} is made of. */
export interface HoldOptions {

    /**
     * Called when a point enters the matter, once per interactor.
     * @param force - How hard the point drove in, 1 being the ordinary gesture.
     */
    onDown: (force: number, event: InstrumentTouchEvent) => void

    /** Called when a held point moves inside the mesh, for the pressure of a held note. */
    onMove?: (event: InstrumentTouchEvent) => void

    /** Called when a point leaves the matter, once per interactor, detaching included. */
    onUp: (event: InstrumentTouchEvent) => void

    /** Called when the mesh starts being designated by anyone. */
    onEnter?: (event: InstrumentAimEvent) => void

    /** Called when the mesh stops being designated by anyone. */
    onExit?: () => void

}

/**
 * A mesh that sounds as long as it is held, one voice per interactor.
 *
 * @remarks
 * Two hands on the same key are two voices, raised and released on their own, which is what a
 * keyboard needs and what a single boolean state cannot express. The light of the mesh is handled
 * here too, since a key that lights up on approach and sounds under the finger is one thing to
 * whoever writes the instrument.
 *
 * Detaching releases every voice still held, so an instrument taken out of the world never leaves a
 * note sounding.
 *
 * @public
 */
export class HoldBehavior implements Behavior<AbstractMesh> {

    public attachedNode: Nullable<AbstractMesh> = null

    constructor(private readonly options: HoldOptions){
        this.#aim = new AimBehavior({ onEnter: options.onEnter, onExit: options.onExit })
    }

    public get name(): string { return this.constructor.name }

    /** The identities of the interactors currently holding the mesh. */
    public get holders(): readonly string[] { return [...this.#voices.keys()] }

    public init(): void {}

    public attach(target: AbstractMesh): void {
        this.detach()
        this.attachedNode = target
        this.#aim.attach(target)

        const interaction = InstrumentInteractionSystem.getInstance()
        this.#observers.push(
            interaction.onTouch.add(event => {
                if(event.mesh !== target) return
                this.#voices.set(event.id, event)
                this.options.onDown(touchForce(event), event)
            }),
            interaction.onTouchMove.add(event => {
                if(event.mesh !== target) return
                if(this.#voices.has(event.id) === false) return
                this.options.onMove?.(event)
            }),
            interaction.onUntouch.add(event => {
                if(event.mesh !== target) return
                if(this.#voices.delete(event.id) === false) return
                this.options.onUp(event)
            }),
        )
    }

    public detach(): void {
        this.#observers.forEach(observer => observer.remove())
        this.#observers.length = 0
        this.attachedNode = null

        const voices = [...this.#voices.values()]
        this.#voices.clear()
        voices.forEach(voice => this.options.onUp(voice))

        this.#aim.detach()
    }

    readonly #aim: AimBehavior

    readonly #voices = new Map<string, InstrumentTouchEvent>()

    readonly #observers: { remove(): void }[] = []

}
