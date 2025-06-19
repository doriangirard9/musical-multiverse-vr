import { Behavior, Ray, Scene, TransformNode } from "@babylonjs/core";
import { XRManager } from "../../xr/XRManager";
import { XRControllerManager } from "../../xr/XRControllerManager";
import { InputManager } from "../../xr/inputs/InputManager";

export class HoldBehaviour implements Behavior<TransformNode> {
  
  name = "HoldBehaviour"
  distance = 5
  target!: TransformNode
  ray!: Ray

  constructor(
    private scene: Scene,
    private xrManager: XRManager,
    private controllers: XRControllerManager,
  ){}

  init(): void {}

  attach(target: TransformNode): void {
    this.target = target

    const inputs = InputManager.getInstance()

    // Move by around by dragging
    const o = inputs.right_thumbstick.setPullInterval(100, (x,y)=>{
      console.log("Thumbstick pull:", x, y)
    })
  

    // Move forward and backward
    const o2 = (event: WheelEvent)=>{
      this.distance += -event.deltaY/200
      console.log("Distance:", this.distance)
      if(this.distance < 0.1) this.distance = 0.1 // Prevent negative distance
      this.updatePos()
    }
    window.addEventListener("wheel",o2)


    this.controllers.addButtonListener("right", "xr-standard-thumbstick", "earar", event=>{
      console.log("Thumbstick event:", event)
    })

    this.detach = ()=>{
      o.remove()
      window.removeEventListener("wheel", o2)
    }

  }

  detach!: () => void

  updatePos(){
    const {origin,direction} = this.ray
    const position = direction.clone() .scaleInPlace(this.distance) .addInPlace(origin)
    this.target.position.copyFrom(position)
  }

}