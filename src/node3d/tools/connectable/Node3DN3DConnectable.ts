import { AbstractMesh, Color3 } from "@babylonjs/core"
import { Node3DConnectable } from "../../Node3DConnectable"
import { Node3DHandle } from "../../Node3DHandle"

/**
 * Connectables for the "node3d" protocol: a cable whose far end is another node itself, dropped
 * on its hitbox, and which delivers a {@link Node3DHandle} on that node.
 *
 * Every node has the input side built in by the host, so only the output side is made here.
 */
export namespace Node3DN3DConnectable {

    export const Type = "node3d"

    export const Color = Color3.FromHexString("#d9a441")

    /**
     * An output that takes hold of the nodes cabled onto it.
     *
     * @remarks
     * Multi by default: as many nodes as are cabled, `attach` called once for each. The far end
     * of a cable being closed, the node at that end being deleted, or the node holding this
     * output being deleted are all one and the same to whoever holds the handles: `detach` is
     * called exactly once per handle, whichever of the three it was. The handle itself says when,
     * since its life is bound to all three, so nothing is counted here.
     */
    export class Output implements Node3DConnectable {

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            private readonly holder: {
                /** A node was cabled onto this output. */
                attach(handle: Node3DHandle): void,
                /** That node is no longer held, the handle is dead from here on. */
                detach(handle: Node3DHandle): void,
            },
            private readonly maxConnections?: number,
        ){ }

        /** The handles held right now, all alive. */
        readonly handles: ReadonlySet<Node3DHandle> = new Set<Node3DHandle>()

        get type() { return Node3DN3DConnectable.Type }

        get direction() { return "output" as "output" }

        get max_connections() { return this.maxConnections }

        get color() { return Node3DN3DConnectable.Color }

        connectAsInput(): any { return {} }

        connectAsOutput(handle: Node3DHandle): void {
            const handles = this.handles as Set<Node3DHandle>
            handles.add(handle)
            handle.onDispose.addOnce(() => {
                handles.delete(handle)
                this.holder.detach(handle)
            })
            this.holder.attach(handle)
        }

        disconnectAsInput(): void { }

        disconnectAsOutput(): void { }
    }

}
