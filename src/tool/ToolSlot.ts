import { Observable, Quaternion, Scene, TransformNode, Vector3 } from "@babylonjs/core"
import { ControllerInput } from "../xr/inputs"
import { Tool } from "./Tool"
import { ToolKind } from "./ToolKind"
import { ToolContext } from "./ToolContext"

/**
 * One hand of the user, and the tool currently held by it.
 *
 * @remarks
 * The slot owns the visual node following the controller, so a tool only has to parent its
 * meshes to it. Selecting a kind disposes the previous tool before creating the new one:
 * two tools never live on the same hand.
 */
export class ToolSlot {


    /** Notified after the held tool changed, with the slot itself. */
    public readonly onChange = new Observable<ToolSlot>()

    constructor(
        /** The side of the hand. */
        public readonly side: "left" | "right",

        /** The controller of the hand. */
        public readonly controller: ControllerInput,

        scene: Scene,
        kind: ToolKind,
    ){
        this.#visual = new TransformNode(`${side} hand`, scene)
        this.#follow()

        this.#context = {
            controller,
            side,
            scene,
            visual: this.#visual,
        }

        this.#kind = kind
        this.#tool = kind.create(this.#context)
    }

    /** The kind currently held by the hand. */
    public get kind(): ToolKind { return this.#kind }

    /** The tool currently held by the hand. */
    public get tool(): Tool { return this.#tool }

    /**
     * Replace the held tool by a new one of the given kind.
     * Selecting the kind already held does nothing.
     * @param kind - The kind to hold.
     */
    public select(kind: ToolKind): void {
        if(kind === this.#kind) return

        this.#tool.dispose()
        this.#tool = kind.create(this.#context)
        this.#kind = kind
        this.onChange.notifyObservers(this)
    }

    /** Dispose the held tool and the visual node of the hand. */
    public dispose(): void {
        this.#tool.dispose()
        this.#followObserver?.remove()
        this.#followObserver = undefined
        this.#visual.dispose()
        this.onChange.clear()
    }


    readonly #visual: TransformNode

    readonly #context: ToolContext

    #tool: Tool

    #kind: ToolKind

    #followObserver?: { remove(): void }

    /** Keep the visual node on the controller, from the pointer matrix so no XR type leaks here. */
    #follow(): void {
        const position = new Vector3()
        const rotation = new Quaternion()
        const scaling = new Vector3()

        this.#visual.rotationQuaternion = rotation

        this.#followObserver = this.controller.pointer.onMove.add(pointer => {
            pointer.matrix.decompose(scaling, rotation, position)
            this.#visual.position.copyFrom(position)
        })
    }

}
