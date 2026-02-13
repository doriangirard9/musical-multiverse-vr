import { Observable, Scene, WebXRInputSource } from "@babylonjs/core";
import { PointerInput } from "./PointerInput";
import { PressableInput, PressableInputEvent } from "./PressableInput";
import { AxisInput } from "./AxisInput";



export class ControllerInput {


    /** The controller pointer input. Useful to handle raycasting and pointing in XR. */
    readonly pointer

    /** The controller trigger input. Useful to handle trigger presses in XR. */
    readonly trigger

    /** The controller squeeze input. Useful to handle squeeze presses in XR. */
    readonly squeeze

    /** The controller thumbstick input. Useful to handle thumbstick movements in XR. */
    readonly thumbstick

    /** Observable that notifies when any of the pressable(squeeze and trigger) inputs change state. */
    readonly onPressableChange = new Observable<PressableInputEvent>()

    constructor(
        /** The side of the controller. Can be "left" or "right". */
        readonly side: "left"|"right"|"none",
        private keys: {
            trigger: string,
            squeeze: string,
            thumbstick: [string, string, string, string],
        }
    ){
        this.pointer = new PointerInput(this)
        this.trigger = new PressableInput(this, "xr-standard-trigger", this.side, this.keys.trigger)
        this.squeeze = new PressableInput(this, "xr-standard-squeeze", this.side, this.keys.squeeze)
        this.thumbstick = new AxisInput(this, this.side, this.keys.thumbstick)

        for(const pressable of [this.trigger, this.squeeze]) {
            pressable.onChange.add((event) => this.onPressableChange.notifyObservers(event))
        }
    }

    _registerXRObserver(controller: WebXRInputSource, scene: Scene): { remove(): void } {
        if(controller.motionController!!.handedness!==this.side) return { remove: () => {} }
        const observers = [
            this.pointer._registerXRObserver(controller, scene),
            this.trigger._registerXRObserver(controller.motionController!!),
            this.squeeze._registerXRObserver(controller.motionController!!),
            this.thumbstick._registerXRObserver(controller.motionController!!),
        ]
        return {
            remove() {
                observers.forEach(o => o.remove())
            }
        }
    }

    _registerDocumentObserver(scene: Scene): { remove(): void } {
        const observers = [
            this.trigger._registerDocumentObserver(),
            this.squeeze._registerDocumentObserver(),
            this.thumbstick._registerDocumentObserver(),
        ]
        return {
            remove() {
                observers.forEach(o => o.remove())
            }
        }   
    }

}