import { Matrix, Quaternion, Vector3 } from "@babylonjs/core"
import { NetworkManager } from "../../../network/NetworkManager"
import { Node3DInstance } from "../../../node3d/instance/Node3DInstance"

/**
 * The frame of a module: where it stands, how it faces, and how large it is.
 *
 * The size is in there, which is what makes a block grown in the hand spread out instead of
 * piling up.
 */
export function frameOf(node: Node3DInstance): Matrix {
    const box = node.boundingBoxMesh
    return Matrix.Compose(box.scaling.clone(), box.rotationQuaternion ?? Quaternion.Identity(), box.absolutePosition)
}

/** One module carried along, where it stands in the block, and the freedom it had before the trip. */
type Follower = {
    node: Node3DInstance
    relative: Matrix
    wasLocked: boolean
}

/**
 * A set of modules carried along with the one a hand holds, held in place as they were.
 *
 * @remarks
 * The place each follower holds is read once and written back from that same reading, never from
 * where it stood one frame ago, so the block is a shape rather than a set of positions and nothing
 * drifts over a long gesture. The three things a hand does to the module it holds reach the block
 * the same way: carried, turned, grown.
 *
 * What travels is frozen for the trip, so no other hand tears a piece out of the block in flight,
 * and given back at the end exactly the freedom it had. A module taken out of the world mid-flight
 * simply stops being part of the block.
 *
 * Nothing is written anywhere and nothing is added to the nodes: the block exists for as long as
 * the hand holds it, and letting go leaves the world as any other hand would have left it.
 */
export class CarriedBlock {

    /** Take these modules along with the one held, each keeping the place it holds right now. */
    public take(held: Node3DInstance, followers: Iterable<Node3DInstance>): void {
        this.release()

        const inverse = frameOf(held).invert()
        for(const node of followers){
            this.#followers.push({node, relative: frameOf(node).multiply(inverse), wasLocked: node.isLocked})
            node.isLocked = true
        }
    }

    /** Read again where each follower stands relative to the module held. */
    public reread(held: Node3DInstance): void {
        const inverse = frameOf(held).invert()
        for(const follower of this.#followers){
            frameOf(follower.node).multiplyToRef(inverse, follower.relative)
        }
    }

    /** Put every follower back where it stands in the block, and say so to the other players. */
    public carry(held: Node3DInstance): void {
        const frame = frameOf(held)
        const scale = new Vector3()
        const rotation = new Quaternion()
        const position = new Vector3()
        const world = NetworkManager.getInstance().node3d.nodes

        for(let index = this.#followers.length - 1; index >= 0; index--){
            const follower = this.#followers[index]

            if(world.getId(follower.node) === undefined){
                follower.node.isLocked = follower.wasLocked
                this.#followers.splice(index, 1)
                continue
            }

            follower.relative.multiply(frame).decompose(scale, rotation, position)

            const box = follower.node.boundingBoxMesh
            box.rotationQuaternion = rotation.clone()
            box.scaling.setAll(scale.x)
            box.setAbsolutePosition(position)
            follower.node.updatePosition()
        }
    }

    /** Let go of everything, giving the followers back the freedom they had. */
    public release(): void {
        for(const follower of this.#followers) follower.node.isLocked = follower.wasLocked
        this.#followers.length = 0
    }

    /** Is this module one of those carried along? */
    public has(node: Node3DInstance): boolean {
        return this.#followers.some(follower => follower.node === node)
    }

    /** The modules carried along, the one held aside. */
    public get nodes(): Node3DInstance[] {
        return this.#followers.map(follower => follower.node)
    }

    /** How many modules are carried along. */
    public get size(): number {
        return this.#followers.length
    }


    readonly #followers: Follower[] = []

}
