import { Behavior, Quaternion, TransformNode, Vector3 } from "@babylonjs/core";
import { PointerInput } from "../../xr/inputs/PointerInput";
import { QuaternionUtils } from "../../utils/quaternion";

/**
 * An object attached to this behavior will be moved around by the user with two controllers.
 * It apply scale, position and rotation changes such as the two points the controllers are
 * pointing at stay the same on the object.
 */
export class TwoPointerHoldBehaviour implements Behavior<TransformNode> {
  
    get name (){ return this.constructor.name }

    on_move: () => void = () => {}

    constructor(readonly pointer1: PointerInput, readonly pointer2: PointerInput){}

    init(): void {}

    attachedNode!: TransformNode

    attach(target: TransformNode): void {
        this.detach()

        this.attachedNode = target

        this.distance = Vector3.Distance(
            this.attachedNode.absolutePosition,
            this.pointer1.origin.add(this.pointer2.origin).scaleInPlace(0.5)
        )

        const o = this.pointer1.onMove.add(()=>{
            this.update()
        })

        const o2 = this.pointer2.onMove.add(()=>{
            this.update()
        })

        this.detach = ()=>{
            o.remove()
            o2.remove()
            this.last_segment = undefined
            this.detach = ()=>{}
        }

    }

    last_segment?: Vector3
    last_center?: Vector3

    update(){
        const new_position1 = this.getPoint(this.pointer1)
        const new_position2 = this.getPoint(this.pointer2)

        const segment = new_position1.subtract(new_position2)

        const new_center = new_position1.add(new_position2).scaleInPlace(0.5)

        if(this.last_segment && this.last_center){
            const rotation = Quaternion.FromUnitVectorsToRef(this.last_segment.normalizeToNew(), segment.normalizeToNew(), new Quaternion())
            QuaternionUtils.setAbsolute(this.attachedNode, rotation.multiply(QuaternionUtils.getAbsolute(this.attachedNode)))

            const scale = segment.length()/this.last_segment.length()
            this.attachedNode.scaling.scaleInPlace(scale)

            const offset = new_center.subtract(this.last_center)
            this.attachedNode.setAbsolutePosition(this.attachedNode.absolutePosition.add(offset))

            this.on_move()
        }

        this.last_center = new_center
        this.last_segment = segment
    }

    distance = 10

    getPoint(pointer: PointerInput): Vector3 {
        return pointer.origin.add(pointer.forward.scale(this.distance))
    }

    detach = ()=>{}
}
