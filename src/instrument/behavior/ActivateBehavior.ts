import { AbstractMesh, Behavior, Nullable } from "@babylonjs/core"
import { InstrumentActivateEvent, InstrumentInteractionSystem } from "../InstrumentInteractionSystem"

/** What an {@link ActivateBehavior} is made of. */
export interface ActivateOptions {

    /**
     * Called when a point starts pressing on the mesh, once per interactor.
     * @param value - How hard it presses, between 0 and 1. 1 for a plain button.
     */
    onActivate: (value: number, event: InstrumentActivateEvent) => void

    /** Called when the pressure of a point already pressing changes, for an aftertouch. */
    onChange?: (value: number, event: InstrumentActivateEvent) => void

    /** Called when a point stops pressing, once per interactor, leaving the matter and detaching included. */
    onDeactivate: (event: InstrumentActivateEvent) => void

}

/**
 * A mesh that answers the click rather than the blow: a button, a key, a switch.
 *
 * @remarks
 * An activation lives under a touch, so the mesh is necessarily touched while it is pressed: what
 * this behavior adds to {@link HoldBehavior} is the will of whoever plays, since a hand may rest on
 * a mesh without pressing it and press without ever having struck it.
 *
 * One voice per interactor, as everywhere else: two hands on the same button are two presses, raised
 * and released on their own. Detaching releases every voice still held, so a mesh taken out of the
 * world never leaves a button stuck down.
 *
 * @public
 */
export class ActivateBehavior implements Behavior<AbstractMesh> {

    public attachedNode: Nullable<AbstractMesh> = null

    constructor(private readonly options: ActivateOptions){}

    public get name(): string { return this.constructor.name }

    /** The identities of the interactors currently pressing the mesh. */
    public get pressers(): readonly string[] { return [...this.#voices.keys()] }

    public init(): void {}

    public attach(target: AbstractMesh): void {
        this.detach()
        this.attachedNode = target

        const interaction = InstrumentInteractionSystem.getInstance()
        this.#observers.push(
            interaction.onActivate.add(event => {
                if(event.mesh !== target) return
                this.#voices.set(event.id, event)
                this.options.onActivate(event.value, event)
            }),
            interaction.onActivateMove.add(event => {
                if(event.mesh !== target) return
                if(this.#voices.has(event.id) === false) return
                this.#voices.set(event.id, event)
                this.options.onChange?.(event.value, event)
            }),
            interaction.onDeactivate.add(event => {
                if(event.mesh !== target) return
                if(this.#voices.delete(event.id) === false) return
                this.options.onDeactivate(event)
            }),
        )
    }

    public detach(): void {
        this.#observers.forEach(observer => observer.remove())
        this.#observers.length = 0
        this.attachedNode = null

        const voices = [...this.#voices.values()]
        this.#voices.clear()
        voices.forEach(voice => this.options.onDeactivate(voice))
    }

    readonly #voices = new Map<string, InstrumentActivateEvent>()

    readonly #observers: { remove(): void }[] = []

}
