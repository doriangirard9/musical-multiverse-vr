import { Matrix, Quaternion, Vector3 } from "@babylonjs/core"
import type { Node3DFrame } from "../../Node3DHandle"

/**
 * Going between the frame of a node and a matrix, for those who compose frames.
 * The scale of a node is uniform everywhere in this project, so one number says it all.
 */
export namespace FrameUtils {

    /** The frame as one matrix. */
    export function toMatrix(frame: Node3DFrame): Matrix {
        return Matrix.Compose(new Vector3(frame.scale, frame.scale, frame.scale), frame.rotation, frame.position)
    }

    /** A matrix read back as a frame. */
    export function fromMatrix(matrix: Matrix): Node3DFrame {
        const scale = new Vector3()
        const rotation = new Quaternion()
        const position = new Vector3()
        matrix.decompose(scale, rotation, position)
        return {position, rotation, scale: scale.x}
    }

    /** The frame of `child` read against the frame of `parent`. */
    export function relative(child: Node3DFrame, parent: Node3DFrame): Matrix {
        return toMatrix(child).multiply(toMatrix(parent).invert())
    }

    /** A relative frame put back into the world under the frame of `parent`. */
    export function absolute(relative: Matrix, parent: Node3DFrame): Node3DFrame {
        return fromMatrix(relative.multiply(toMatrix(parent)))
    }
}
