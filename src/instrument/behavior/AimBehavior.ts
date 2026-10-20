import { AbstractMesh, Behavior, Nullable } from "@babylonjs/core"
import { InstrumentInteractionSystem, InstrumentAimEvent } from "../InstrumentInteractionSystem"

/** What an {@link AimBehavior} is made of. */
export interface AimOptions {

    /** Called when the mesh starts being designated, no interactor designating it before. */
    onEnter?: (event: InstrumentAimEvent) => void

    /** Called whenever a designating point moves over the mesh. */
    onMove?: (event: InstrumentAimEvent) => void

    /** Called when the mesh stops being designated by anyone. */
    onExit?: () => void

}

/**
 * A mesh that reacts to being designated, without being played.
 *
 * @remarks
 * The interactors are not told apart: the mesh is lit as soon as one designates it and goes dark once
 * the last one looks away. Detaching goes dark too, so a mesh never stays lit by a behavior that is
 * no longer listening. A mesh that is also played carries its light in {@link HoldBehavior} or
 * {@link StrikeBehavior} instead of adding this one.
 *
 * @public
 */
export class AimBehavior implements Behavior<AbstractMesh> {

    public attachedNode: Nullable<AbstractMesh> = null

    constructor(private readonly options: AimOptions){}

    public get name(): string { return this.constructor.name }

    /** The identities of the interactors currently designating the mesh. */
    public get aimers(): readonly string[] { return [...this.#aimers] }

    public init(): void {}

    public attach(target: AbstractMesh): void {
        this.detach()
        this.attachedNode = target

        const interaction = InstrumentInteractionSystem.getInstance()
        this.#observers.push(
            interaction.onAim.add(event => {
                if(event.mesh !== target) return
                this.#aimers.add(event.id)
                if(this.#aimers.size === 1) this.options.onEnter?.(event)
            }),
            interaction.onAimMove.add(event => {
                if(event.mesh !== target) return
                this.options.onMove?.(event)
            }),
            interaction.onUnaim.add(event => {
                if(event.mesh !== target) return
                this.#aimers.delete(event.id)
                if(this.#aimers.size === 0) this.options.onExit?.()
            }),
        )
    }

    public detach(): void {
        this.#observers.forEach(observer => observer.remove())
        this.#observers.length = 0
        this.attachedNode = null

        if(this.#aimers.size > 0){
            this.#aimers.clear()
            this.options.onExit?.()
        }
    }

    readonly #aimers = new Set<string>()

    readonly #observers: { remove(): void }[] = []

}
