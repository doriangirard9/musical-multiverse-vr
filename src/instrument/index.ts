/**
 * The physical interactions between the points of matter of the world and the meshes of the instruments.
 *
 * A point of matter is an {@link Interactor}: the head of a wand, a fingertip, the far end of a ray.
 * It is created by {@link InstrumentInteractionSystem}, moved by whoever asked for it, and states what
 * it aims at, what it touches and when it presses. The system relays that to whoever listens, and
 * holds the aim, the touch and the activation currently open for each interactor.
 *
 * The behaviors turn that into the ways an instrument is played: held, struck, plucked, rubbed,
 * pressed, read on its surface, or merely designated. A mesh wears the ones its sound is made of, a
 * drum being a strike and a surface.
 *
 * Nothing here detects anything: how a point meets a mesh belongs to whoever moves it.
 *
 * @packageDocumentation
 */

export * from "./Interactor"
export * from "./InstrumentInteractionSystem"

export * from "./behavior/AimBehavior"
export * from "./behavior/ActivateBehavior"
export * from "./behavior/HoldBehavior"
export * from "./behavior/StrikeBehavior"
export * from "./behavior/SurfaceBehavior"
export * from "./behavior/PluckBehavior"
export * from "./behavior/RubBehavior"
