import { Observable, Scene, WebXRInputSource } from "@babylonjs/core";
import { PointerInput } from "./PointerInput";
import { PressableInput, PressableInputEvent } from "./PressableInput";
import { AxisInput } from "./AxisInput";


/**
 * Class representing the inputs of a controller. It provides access to the pointer, trigger, squeeze and thumbstick inputs of the controller.
 */
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
    ){
        this.pointer = new PointerInput(this)
        this.trigger = new PressableInput(this, "xr-standard-trigger", this.side)
        this.squeeze = new PressableInput(this, "xr-standard-squeeze", this.side)
        this.thumbstick = new AxisInput(this, this.side)

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

    _registerDocumentObserver(
        scene: Scene,
        trigger: string|number|null = null,
        squeeze: string|number|null = null,
        thumbstick: [string,string,string,string]|null = null,
        thumbstickScroll = false,
        pointerMovement = false,
    ): { remove(): void } {
        const observers: {remove(): void}[] = []
        if(trigger!=null) observers.push(this.trigger._registerDocumentObserver(trigger))
        if(squeeze!=null) observers.push(this.squeeze._registerDocumentObserver(squeeze))
        if(thumbstick!=null) observers.push(this.thumbstick._registerKeyObserver(...thumbstick))
        if(thumbstickScroll) observers.push(this.thumbstick._registerMouseWheelObserver())
        if(pointerMovement) observers.push(this.pointer._registerMouseObserver(scene))
        return {
            remove() {
                observers.forEach(o => o.remove())
            }
        }   
    }
    

}