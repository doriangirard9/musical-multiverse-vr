import { AbstractMesh, Matrix, Vector3 } from "@babylonjs/core"
import type { _InteractionSink, InstrumentActivateEvent, InstrumentAimEvent, InstrumentTouchEvent } from "./InstrumentInteractionSystem"

/** Scratch matrix for the world to local conversion of a point. */
const inverse = Matrix.Identity()

/**
 * A point of matter that plays the instruments: the head of a wand, a fingertip, the far end of a ray.
 *
 * @remarks
 * An interactor is created by the system and says what it meets, from wherever it knows it: a loop of
 * its own, a physics collision, a script. Everything a mesh expects around that is held here: the
 * identity, the switch from a mesh to another, the pairing of an aim and a touch, the ordering of the
 * events, and the closing of what is still open when the interactor goes away.
 *
 * How the point came to be engaged in the matter belongs to whoever moves it: a wand engages by
 * moving, a ray engages by sinking its point under the aimed surface, so an instrument never asks
 * what kind of thing plays it. Nothing checks that a published touch has a geometric reality, nor
 * that the velocity keeps to its scale: the owner of the interactor is the only judge of both.
 *
 * What is guaranteed to whoever listens, whatever the owner does:
 *
 *  - A mesh is aimed at before it is touched, and touched before it is activated.
 *  - It stays aimed at for the whole touch, and touched for the whole activation.
 *  - The aimed, the touched and the activated mesh are never two different meshes.
 *  - What is nested is closed first: activation, then touch, then aim, so a mesh falls silent before
 *    it goes dark.
 *  - Everything open is closed by {@link dispose}, and nothing is published afterwards.
 *
 * The owner may leave the aim entirely alone: a hand that only ever states what it touches is a
 * correct use, and the aim is opened and closed around each touch on its behalf. What is a mistake is
 * dropping the aim while the touch it carries is still open, since that asks for a mesh to go dark
 * while it sounds. Such calls are honoured in the only order that keeps the guarantees, and warned
 * about rather than obeyed literally.
 *
 * The activation is not published the way the two others are: it is a state of the interactor, which
 * {@link activate} may set at any time, touching something or not. A trigger held in the empty air
 * is an activated interactor that says nothing to anyone; the moment it enters a mesh, the touch is
 * published and the activation right after it. So the owner mirrors its button into the interactor
 * and never has to ask itself when it is allowed to.
 *
 * @public
 */
export class Interactor {

    /** The identity of the interactor, stable for its whole life and never reused. */
    public readonly id: string

    /**
     * The velocity of the point, in units per second, as a direction scaled by a speed.
     * Owned by whoever moves the interactor, which writes into it rather than replacing it.
     *
     * @remarks
     * A norm of 1 is the ordinary gesture: a firm strike, a finger pressing normally. Above that the
     * gesture is fast and forceful, below it slow and held back. A point that moves without any real
     * motion behind it, such as a ray sinking under the aimed surface, still reports on this scale.
     * The value is an instantaneous velocity, never a per-frame delta.
     */
    public readonly velocity = new Vector3()

    /**
     * Only the interaction system creates interactors, a Node3D never does.
     * @internal
     * @param sink - Where the published events go, the system that created the interactor.
     * @param id - The identity of the interactor.
     * @param onPulse - How to shake whoever holds the interactor. An interactor that cannot be felt leaves it out.
     */
    constructor(
        sink: _InteractionSink,
        id: string,
        onPulse?: (strength: number, duration: number) => void,
    ){
        this.id = id
        this.#sink = sink
        this.#onPulse = onPulse
    }

    /** The mesh the interactor is engaged in, none when it touches nothing. */
    public get touchedMesh(): AbstractMesh | null { return this.#touch?.mesh ?? null }

    /** The mesh the interactor designates, none when it aims at nothing. */
    public get aimedMesh(): AbstractMesh | null { return this.#aim?.mesh ?? null }

    /**
     * Is the interactor pressing?
     * The state of the owner alone: an interactor pressing on nothing is activated all the same, and
     * publishes nothing until it touches something.
     */
    public get activated(): boolean { return this.#value !== undefined }

    /** How hard the interactor presses, between 0 and 1, zero when it does not press at all. */
    public get activationValue(): number { return this.#value ?? 0 }

    /**
     * Send a physical feedback to whoever holds the interactor. Does nothing when it cannot be felt.
     * @param strength - The intensity of the pulse, between 0 and 1.
     * @param duration - The length of the pulse, in milliseconds.
     */
    public pulse(strength: number, duration: number): void {
        this.#onPulse?.(strength, duration)
    }

    /**
     * State that the point is engaged in a mesh.
     * Opening a touch on a mesh which is not the aimed one moves the aim there first, so a mesh is
     * always aimed at before it is touched.
     *
     * @param mesh - The mesh the point is engaged in.
     * @param point - The point of the touch, in world space.
     * @param normal - The normal of the surface at that point, in world space.
     * @throws Error when the interactor is disposed.
     */
    public setTouch(mesh: AbstractMesh, point: Vector3, normal: Vector3): void {
        this.#assertAlive()
        if(mesh.isDisposed() === true){
            this.#warn("a touch was published on a disposed mesh, and was dropped")
            this.clearTouch()
            return
        }

        if(this.#touch?.mesh === mesh){
            this.#touch = this.#touchEvent(mesh, point, normal, this.#touch.velocity)
            this.#sink._moveTouch(this.#touch)
            return
        }

        // The mesh already aimed at is only touched: its aim goes on, since a touch lives under it.
        if(this.#aim?.mesh !== mesh){
            this.#close()
            this.#openAim(mesh, point)
        }

        this.#touch = this.#touchEvent(mesh, point, normal, this.velocity.clone())
        this.#sink._openTouch(this.#touch)

        // The matter may be entered with the button already held: what it presses on now exists.
        this.#openActivation()
    }

    /**
     * State that the point left the matter. Does nothing when it was not engaged.
     * An activation published under the touch is closed first, the interactor staying activated: the
     * button is still held, and the next touch publishes an activation again.
     */
    public clearTouch(): void {
        const touch = this.#touch
        if(touch === undefined) return

        this.#closeActivation()

        this.#touch = undefined
        this.#sink._closeTouch(this.#touchEvent(touch.mesh, touch.point, touch.normal, this.velocity.clone()))
    }

    /**
     * State that the interactor presses.
     *
     * @remarks
     * Pressing on nothing is not a mistake: the state is kept, nothing is published, and the moment
     * the point enters a mesh the activation is published under the touch. Pressing while touching
     * publishes it at once. Calling it again while pressing states a new pressure.
     *
     * @param value - How hard it presses, between 0 and 1. 1 for a plain button.
     * @throws Error when the interactor is disposed.
     */
    public activate(value = 1): void {
        this.#assertAlive()
        this.#value = value

        if(this.#touch === undefined) return

        if(this.#activation === undefined){
            this.#openActivation()
            return
        }

        this.#activation = this.#activateEvent(this.#touch, value)
        this.#sink._moveActivation(this.#activation)
    }

    /** State that the interactor stops pressing. Does nothing when it was not pressing. */
    public deactivate(): void {
        if(this.#value === undefined) return

        this.#value = undefined
        this.#closeActivation()
    }

    /**
     * State that the point designates a mesh.
     *
     * @remarks
     * Designating another mesh while one is touched takes the point out of the matter first, which
     * is a mistake on the side of the owner: a point cannot be somewhere else and still be engaged
     * in what it left. The touch is closed and the move is warned about.
     *
     * @param mesh - The designated mesh.
     * @param point - The designated point on it, in world space.
     * @throws Error when the interactor is disposed.
     */
    public setAim(mesh: AbstractMesh, point: Vector3): void {
        this.#assertAlive()
        if(mesh.isDisposed() === true){
            this.#warn("an aim was published on a disposed mesh, and was dropped")
            this.clearAim()
            return
        }

        if(this.#aim?.mesh === mesh){
            this.#aim = this.#aimEvent(mesh, point)
            this.#sink._moveAim(this.#aim)
            return
        }

        if(this.#touch !== undefined){
            this.#warn(`the aim was moved to "${mesh.name}" while "${this.#touch.mesh.name}" was still touched; the touch is closed first`)
        }

        this.#close()
        this.#openAim(mesh, point)
    }

    /**
     * State that the point designates nothing. Does nothing when it designated nothing.
     *
     * @remarks
     * A touch open under the aim is closed first, so a mesh falls silent before it goes dark. Doing
     * it while touching is a mistake on the side of the owner, which is why it is warned about: a
     * point that left what it designates has necessarily left the matter of it, and the owner is the
     * only one that knows with what velocity. Whoever never touches anything may drop the aim freely.
     */
    public clearAim(): void {
        if(this.#aim === undefined) return

        if(this.#touch !== undefined){
            this.#warn(`the aim was dropped while "${this.#touch.mesh.name}" was still touched; the touch is closed first`)
        }

        this.#close()
    }

    /**
     * Close the touch and the aim, and refuse anything published afterwards.
     * Whoever owns the interactor calls it once the point stops existing. Calling it twice does nothing.
     */
    public dispose(): void {
        if(this.#disposed === true) return

        this.#close()
        this.#disposed = true
    }

    readonly #sink: _InteractionSink

    readonly #onPulse?: (strength: number, duration: number) => void

    #touch?: InstrumentTouchEvent

    #aim?: InstrumentAimEvent

    /** The activation published to the instruments, none while nothing is touched. */
    #activation?: InstrumentActivateEvent

    /** How hard the owner presses, none when it does not press. Kept whether anything is touched or not. */
    #value?: number

    #disposed = false

    /**
     * Close what is open, from the innermost out: the activation, then the touch, then the aim.
     * Everything that ends an engagement goes through here, so the order can never be got wrong: a
     * mesh falls silent, then it goes dark. The pressure of the owner is left alone, since a button
     * held stays held whatever the point it moves meets.
     */
    #close(): void {
        this.clearTouch()

        const aim = this.#aim
        if(aim === undefined) return

        this.#aim = undefined
        this.#sink._closeAim(this.#aimEvent(aim.mesh, aim.point))
    }

    /**
     * Publish the pressure of the owner under the touch it lives on.
     * Does nothing when the owner does not press, or when there is nothing to press on yet.
     */
    #openActivation(): void {
        if(this.#value === undefined || this.#touch === undefined) return

        this.#activation = this.#activateEvent(this.#touch, this.#value)
        this.#sink._openActivation(this.#activation)
    }

    /** Close the activation published to the instruments, if there was one. */
    #closeActivation(): void {
        const activation = this.#activation
        if(activation === undefined) return

        this.#activation = undefined
        this.#sink._closeActivation(activation)
    }

    /** Open an aim on a mesh, nothing being open anymore. */
    #openAim(mesh: AbstractMesh, point: Vector3): void {
        this.#aim = this.#aimEvent(mesh, point)
        this.#sink._openAim(this.#aim)
    }

    #assertAlive(): void {
        if(this.#disposed === true) throw new Error(`Interactor: "${this.id}" is disposed and cannot publish anymore`)
    }

    /** Report a call that could not be obeyed as it was made, and what was done instead. */
    #warn(problem: string): void {
        console.warn(`Interactor "${this.id}": ${problem}`)
    }

    /** The point in the local space of the mesh it lies on. */
    #localOf(mesh: AbstractMesh, point: Vector3): Vector3 {
        mesh.getWorldMatrix().invertToRef(inverse)
        return Vector3.TransformCoordinates(point, inverse)
    }

    #touchEvent(mesh: AbstractMesh, point: Vector3, normal: Vector3, velocity: Vector3): InstrumentTouchEvent {
        return {
            id: this.id,
            interactor: this,
            mesh,
            point: point.clone(),
            local: this.#localOf(mesh, point),
            normal: normal.clone(),
            velocity,
        }
    }

    /** The activation of a pressure, laid on the touch it lives under. */
    #activateEvent(touch: InstrumentTouchEvent, value: number): InstrumentActivateEvent {
        return {
            id: this.id,
            interactor: this,
            mesh: touch.mesh,
            point: touch.point,
            local: touch.local,
            normal: touch.normal,
            value,
        }
    }

    #aimEvent(mesh: AbstractMesh, point: Vector3): InstrumentAimEvent {
        return {
            id: this.id,
            interactor: this,
            mesh,
            point: point.clone(),
            local: this.#localOf(mesh, point),
            velocity: this.velocity.clone(),
        }
    }

}
