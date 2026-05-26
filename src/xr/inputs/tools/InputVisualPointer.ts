import { AbstractMesh, Color3, CreateCylinder, CreateIcoSphere, Quaternion, Scene, Vector3 } from "@babylonjs/core";
import { PointerInput } from "../PointerInput";
import { MeshUtils } from "../../../node3d/tools";



export class InputVisualPointer {

    private observers: {remove(): void}[] = []

    constructor(
        public pointer: PointerInput,
        public line: AbstractMesh,
        public point: AbstractMesh
    ){
        const up = Vector3.Up()
        const target = new Vector3()
        const center = new Vector3()
        const offset = new Vector3()
        const quaternion = new Quaternion()
        line.rotationQuaternion = quaternion

        const onMove = () => {
            
            if(pointer.hit){
                target.copyFrom(pointer.target)
                point.setEnabled(true)
            }
            else{
                target.copyFrom(pointer.forward).scaleInPlace(10).addInPlace(pointer.origin)
                point.setEnabled(false)
            }

            center .copyFrom(pointer.origin).addInPlace(target).scaleInPlace(0.5)
            offset .copyFrom(target).subtractInPlace(pointer.origin)
            const length = offset.length()

            line.position.copyFrom(center)
            line.scaling.y = length
            Quaternion.FromUnitVectorsToRef(up, offset.normalize(), quaternion)

            point.position.copyFrom(target)
            point.scaling.setAll(1+length/5)
            
        }

        let press_count = 0
        function thickness(offset: number){
            press_count += offset
            let t = 1.0 + press_count*0.5
            line.scaling.x = t
            line.scaling.z = t
        }

        const onPress = () => thickness(1)
        
        const onRelease = () =>  thickness(-1)

        this.observers.push(
            pointer.onMove.add(onMove),
            pointer.controller.trigger.onDown.add(onPress),
            pointer.controller.trigger.onUp.add(onRelease),
            pointer.controller.squeeze.onDown.add(onPress),
            pointer.controller.squeeze.onUp.add(onRelease),
        )
    }

    remove() {
        for(const o of this.observers) o.remove()
    }

    static CreateSimple(scene: Scene, pointer: PointerInput){
        const line = CreateCylinder(pointer.controller.side+" pointer line", {diameter: 0.005, height: 1, subdivisions:3}, scene)
        line.isPickable = false
        line.visibility = 0.5

        const point = CreateIcoSphere(pointer.controller.side+" pointer point", {radius:0.01,subdivisions:5}, scene)
        point.isPickable = false

        const visual = new InputVisualPointer(pointer, line, point)

        return {
            line,
            point,
            visual,
            remove(){
                visual.remove()
                line.dispose()
                point.dispose()
            },
        }
    }

}