import { AbstractMesh, Observable, Vector3 } from "@babylonjs/core"
import { Interactor } from "./Interactor"

/**
 * A mesh designated by an interactor which is not engaged in it.
 *
 * @remarks
 * The vectors belong to the event and are never mutated afterwards, so an instrument may keep one.
 *
 * @public
 */
export interface InstrumentAimEvent {

    /** The identity of the aiming interactor, enough to index a voice without holding the interactor. */
    readonly id: string

    /** The aiming interactor. */
    readonly interactor: Interactor

    /** The aimed mesh, exactly the one met by the aim, with no walk up to a parent. */
    readonly mesh: AbstractMesh

    /** The aimed point on the mesh, in world space. */
    readonly point: Vector3

    /** The aimed point in the local space of the aimed mesh. */
    readonly local: Vector3

    /** The velocity of the interactor when the event was published. */
    readonly velocity: Vector3

}

/**
 * A mesh a point of matter is engaged in.
 *
 * @remarks
 * The strength of a strike is `-Vector3.Dot(velocity, normal)`, on the scale where 1 is the ordinary
 * gesture. A grazing move along the surface therefore reads as almost no strength, which is what
 * separates a strike from a brush.
 *
 * @public
 */
export interface InstrumentTouchEvent {

    /** The identity of the touching interactor, enough to index a voice without holding the interactor. */
    readonly id: string

    /** The touching interactor. */
    readonly interactor: Interactor

    /** The touched mesh, exactly the one met by the point, with no walk up to a parent. */
    readonly mesh: AbstractMesh

    /** The point of the touch, in world space. */
    readonly point: Vector3

    /** The point of the touch in the local space of the touched mesh. */
    readonly local: Vector3

    /** The normal of the surface at the point of the touch, in world space. */
    readonly normal: Vector3

    /**
     * The velocity the interactor entered the matter with, kept for the whole touch.
     * The event closing a touch carries the velocity of the moment it was released instead.
     */
    readonly velocity: Vector3

}

/**
 * How hard a touch drives into the surface, on the scale where 1 is the ordinary gesture.
 *
 * @remarks
 * Only the part of the velocity going into the matter counts, so a point sliding along a surface
 * reads as almost nothing and a point leaving it reads as negative. That is what separates a strike
 * from a brush, and what lets a behavior drop a touch that is on its way out.
 *
 * The velocity of a touch is the one it was entered with, so this is the force of the blow and not
 * the force of the moment. A behavior that follows a point already in the matter reads the velocity
 * of {@link InstrumentTouchEvent.interactor} against the normal of the touch instead.
 *
 * @param event - The touch to measure.
 *
 * @public
 */
export function touchForce(event: InstrumentTouchEvent): number {
    return -Vector3.Dot(event.velocity, event.normal)
}

/**
 * A mesh a point of matter is engaged in and pressing on, the click of a button under a finger.
 *
 * @remarks
 * An activation lives under a touch and borrows its geometry: what is activated is what is touched,
 * at the point it is touched. Whoever holds the interactor decides what activates it, a trigger for
 * every hand of the application, so an instrument never asks what pressed it.
 *
 * @public
 */
export interface InstrumentActivateEvent {

    /** The identity of the activating interactor, enough to index a voice without holding the interactor. */
    readonly id: string

    /** The activating interactor. */
    readonly interactor: Interactor

    /** The activated mesh, the one the interactor is engaged in. */
    readonly mesh: AbstractMesh

    /** The point of the touch the activation lives under, in world space. */
    readonly point: Vector3

    /** That same point in the local space of the activated mesh. */
    readonly local: Vector3

    /** The normal of the surface at that point, in world space. */
    readonly normal: Vector3

    /**
     * How hard the activation is pressed, between 0 and 1.
     * 1 for a plain button, which is either pressed or not, and anything in between for a trigger
     * read as an aftertouch.
     */
    readonly value: number

}

/**
 * Where an interactor sends what it publishes, held by the system that created it.
 * @internal
 */
export interface _InteractionSink {
    _openAim(event: InstrumentAimEvent): void
    _moveAim(event: InstrumentAimEvent): void
    _closeAim(event: InstrumentAimEvent): void
    _openTouch(event: InstrumentTouchEvent): void
    _moveTouch(event: InstrumentTouchEvent): void
    _closeTouch(event: InstrumentTouchEvent): void
    _openActivation(event: InstrumentActivateEvent): void
    _moveActivation(event: InstrumentActivateEvent): void
    _closeActivation(event: InstrumentActivateEvent): void
}

/**
 * The physical interactions between the points of matter of the world and the meshes of the instruments.
 *
 * @remarks
 * The system holds no loop and detects nothing: an interactor knows how it meets the meshes, whether
 * by sweeping a segment, by a physics collision or by a script, and states it. What the system owns
 * is the identity of the interactors it creates, the state currently open for each of them, and the
 * observables the instruments listen to.
 *
 * Three channels, nested rather than exclusive: a mesh is aimed at before it is touched, touched
 * before it is activated, and stays aimed at for the whole touch as it stays touched for the whole
 * activation. An instrument therefore lights up on approach, keeps its light while it sounds, and
 * goes dark only once it fell silent. That order is guaranteed by {@link Interactor}, whatever the
 * owner of a point does. An interactor is a single point, so it aims at most at one mesh, touches at
 * most one mesh and activates at most one mesh, which is why the state of one is read through
 * {@link InstrumentInteractionSystem.tryGetAim}, {@link InstrumentInteractionSystem.tryGetTouch} and
 * {@link InstrumentInteractionSystem.tryGetActivation} rather than a list.
 *
 * The system depends on nothing but Babylon, so an instrument reaches it without reaching into the
 * application.
 *
 * @public
 */
export class InstrumentInteractionSystem implements _InteractionSink {

    /** Notified when an interactor starts aiming at a mesh. */
    public readonly onAim = new Observable<InstrumentAimEvent>()

    /** Notified when the point aimed at by an interactor moves over the same mesh. */
    public readonly onAimMove = new Observable<InstrumentAimEvent>()

    /** Notified when an interactor stops aiming at a mesh, whatever the reason. */
    public readonly onUnaim = new Observable<InstrumentAimEvent>()

    /** Notified when an interactor enters the matter of a mesh. */
    public readonly onTouch = new Observable<InstrumentTouchEvent>()

    /** Notified when the point of a touch moves inside the same mesh. */
    public readonly onTouchMove = new Observable<InstrumentTouchEvent>()

    /** Notified when an interactor leaves the matter of a mesh, whatever the reason. */
    public readonly onUntouch = new Observable<InstrumentTouchEvent>()

    /** Notified when an interactor presses on the mesh it is engaged in. */
    public readonly onActivate = new Observable<InstrumentActivateEvent>()

    /** Notified when the pressure of an open activation changes. */
    public readonly onActivateMove = new Observable<InstrumentActivateEvent>()

    /** Notified when an interactor stops pressing, whatever the reason, leaving the matter included. */
    public readonly onDeactivate = new Observable<InstrumentActivateEvent>()

    /**
     * The system of the application.
     * Created on the first call, since the system needs nothing to exist.
     */
    public static getInstance(): InstrumentInteractionSystem {
        if(InstrumentInteractionSystem.#instance === undefined){
            InstrumentInteractionSystem.#instance = new InstrumentInteractionSystem()
        }
        return InstrumentInteractionSystem.#instance
    }

    /** The aims currently open, at most one per interactor. */
    public get aims(): readonly InstrumentAimEvent[] { return [...this.#aims.values()] }

    /** The touches currently open, at most one per interactor. */
    public get touches(): readonly InstrumentTouchEvent[] { return [...this.#touches.values()] }

    /** The activations currently open, at most one per interactor. */
    public get activations(): readonly InstrumentActivateEvent[] { return [...this.#activations.values()] }

    /**
     * Create a point of matter able to play the instruments.
     * Whoever asked for it moves it, states what it meets, and disposes it once it stops existing.
     *
     * @param label - A human readable prefix of the identity, for reading logs. It carries no meaning.
     * @param onPulse - How to shake whoever holds the interactor. An interactor that cannot be felt leaves it out.
     */
    public createInteractor(label: string, onPulse?: (strength: number, duration: number) => void): Interactor {
        this.#count++
        return new Interactor(this, `${label}#${this.#count}`, onPulse)
    }

    /**
     * The aim currently open for an interactor.
     * @param id - The identity of the interactor.
     */
    public tryGetAim(id: string): InstrumentAimEvent | null { return this.#aims.get(id) ?? null }

    /**
     * The touch currently open for an interactor.
     * @param id - The identity of the interactor.
     */
    public tryGetTouch(id: string): InstrumentTouchEvent | null { return this.#touches.get(id) ?? null }

    /**
     * The activation currently open for an interactor.
     * @param id - The identity of the interactor.
     */
    public tryGetActivation(id: string): InstrumentActivateEvent | null { return this.#activations.get(id) ?? null }

    /** @internal */
    public _openAim(event: InstrumentAimEvent): void {
        this.#aims.set(event.id, event)
        this.onAim.notifyObservers(event)
    }

    /** @internal */
    public _moveAim(event: InstrumentAimEvent): void {
        this.#aims.set(event.id, event)
        this.onAimMove.notifyObservers(event)
    }

    /** @internal */
    public _closeAim(event: InstrumentAimEvent): void {
        this.#aims.delete(event.id)
        this.onUnaim.notifyObservers(event)
    }

    /** @internal */
    public _openTouch(event: InstrumentTouchEvent): void {
        this.#touches.set(event.id, event)
        this.onTouch.notifyObservers(event)
    }

    /** @internal */
    public _moveTouch(event: InstrumentTouchEvent): void {
        this.#touches.set(event.id, event)
        this.onTouchMove.notifyObservers(event)
    }

    /** @internal */
    public _closeTouch(event: InstrumentTouchEvent): void {
        this.#touches.delete(event.id)
        this.onUntouch.notifyObservers(event)
    }

    /** @internal */
    public _openActivation(event: InstrumentActivateEvent): void {
        this.#activations.set(event.id, event)
        this.onActivate.notifyObservers(event)
    }

    /** @internal */
    public _moveActivation(event: InstrumentActivateEvent): void {
        this.#activations.set(event.id, event)
        this.onActivateMove.notifyObservers(event)
    }

    /** @internal */
    public _closeActivation(event: InstrumentActivateEvent): void {
        this.#activations.delete(event.id)
        this.onDeactivate.notifyObservers(event)
    }

    static #instance?: InstrumentInteractionSystem

    readonly #aims = new Map<string, InstrumentAimEvent>()

    readonly #touches = new Map<string, InstrumentTouchEvent>()

    readonly #activations = new Map<string, InstrumentActivateEvent>()

    /**
     * The number of identities handed out.
     * It never goes back, released identities included, so an event published late can never be
     * attributed to a newer interactor.
     */
    #count = 0

}
