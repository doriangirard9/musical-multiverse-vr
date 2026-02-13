import { Immutable, Observable, Scene, Vector3, WebXRDefaultExperience, WebXRInputSource } from "@babylonjs/core";
import { ButtonInput, ButtonInputEvent } from "./ButtonInput";
import { PressableInputEvent } from "./PressableInput";
import { AxisInputEvent } from "./AxisInput";
import { ControllerInput } from "./ControllerInput";
import { PointerInput } from "./PointerInput";

export interface PointerMovementEvent {
    origin: Immutable<Vector3>,
    forward: Immutable<Vector3>,
    up: Immutable<Vector3>,
    right: Immutable<Vector3>,
    target: Immutable<Vector3>,
}

export class InputManager {


    //// SINGLETON ////
    private static instance: InputManager;
        
    public static getInstance(): InputManager { return this.instance }

    public static create(xrHelper: WebXRDefaultExperience, scene: Scene) { this.instance = new InputManager(xrHelper, scene) }
    
    
    //// OBSERVERS ////
    readonly x_button = new ButtonInput("x-button", "left", "x")
    readonly y_button = new ButtonInput("y-button", "left", "y")
    readonly a_button = new ButtonInput("a-button", "right", "a")
    readonly b_button = new ButtonInput("b-button", "right", "b")
    readonly on_button_change = new Observable<ButtonInputEvent>()

    readonly left = new ControllerInput(
        "left",
        {
            trigger: "z",
            squeeze: "s",
            thumbstick: ["k", "m", "o", "l"],
        }
    )

    readonly right = new ControllerInput(
        "right",
        {
            trigger: "e",
            squeeze: "d",
            thumbstick: ["arrowleft", "arrowright", "arrowup", "arrowdown"],
        }
    )

    readonly screen = new ControllerInput(
        "none",
        {
            trigger: "r",
            squeeze: "f",
            thumbstick: ["_", "_", "_", "_"],
        }
    )

    get controllers() { return [this.left, this.right, this.screen] }

    readonly onTriggerChange = new Observable<PressableInputEvent>()
    readonly onSqueezeChange = new Observable<PressableInputEvent>()
    readonly onPressableChange = new Observable<PressableInputEvent>()
    readonly onThumbstickChange = new Observable<AxisInputEvent>()
    readonly onNewtarget = new Observable<PointerInput>()

    private constructor(
        xrHelper: WebXRDefaultExperience,
        scene: Scene,
    ){
        const im = this
        
        // Link observers
        for(const button of [im.x_button, im.y_button, im.a_button, im.b_button]) {
            button.onChange.add((event) => im.on_button_change.notifyObservers(event))
        }

        for(const controller of [im.left, im.right]) {
            controller._registerDocumentObserver(scene)
            controller.thumbstick.on_change.add((event) => im.onThumbstickChange.notifyObservers(event))
            controller.squeeze.onChange.add((event) => im.onSqueezeChange.notifyObservers(event))
            controller.trigger.onChange.add((event) => im.onTriggerChange.notifyObservers(event))
            controller.onPressableChange.add((event) => im.onPressableChange.notifyObservers(event))
            controller.pointer.onNewTarget.add((event) => im.onNewtarget.notifyObservers(event))
        }

        // Register document observers
        for(const button of [im.x_button, im.y_button, im.a_button, im.b_button]) {
            button._registerDocumentObserver()
        }

        for(const controller of [im.left, im.right]) {
            controller._registerDocumentObserver(scene)
        }

        this.screen._registerDocumentObserver(scene)
        this.screen.pointer._registerMouseObserver(scene)
        im.left.thumbstick._registerMouseWheelObserver()

        // Register XR observers
        function initController(controller: WebXRInputSource){
            controller.onMotionControllerInitObservable.addOnce(()=>{
                const {motionController} = controller
                if(!motionController) return
                
                for(const button of [im.x_button, im.y_button, im.a_button, im.b_button]) {
                    button._registerXRObserver(motionController)
                }

                for(const cinput of [im.left, im.right]) {
                    cinput._registerXRObserver(controller, scene)
                }
                
            })
        }
        xrHelper.input.onControllerAddedObservable.add(initController)
        xrHelper.input.controllers.forEach(initController)
    }
}