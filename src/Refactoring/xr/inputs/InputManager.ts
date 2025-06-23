import { Observable, PointerEventTypes, Scene, Vector3, WebXRDefaultExperience, WebXRInputSource } from "@babylonjs/core";
import { ButtonInput, ButtonInputEvent } from "./ButtonInput";
import { PressableInput, PressableInputEvent } from "./PressableInput";
import { AxisInput, AxisInputEvent } from "./AxisInput";

export interface PointerMovementEvent {
    origin: Vector3,
    forward: Vector3,
    up: Vector3,
    right: Vector3,
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

    readonly left_trigger = new PressableInput("xr-standard-trigger", "left", "q")
    readonly right_trigger = new PressableInput("xr-standard-trigger", "right", "s")
    readonly left_squeeze = new PressableInput("xr-standard-squeeze", "left", "w")
    readonly right_squeeze = new PressableInput("xr-standard-squeeze", "right", "x")
    readonly on_trigger_change = new Observable<PressableInputEvent>()
    readonly on_squeeze_change = new Observable<PressableInputEvent>()
    readonly on_pressable_change = new Observable<PressableInputEvent>()

    readonly left_thumbstick = new AxisInput("left", ["arrowleft", "arrowright", "arrowup", "arrowdown"])
    readonly right_thumbstick = new AxisInput("right", ["k", "m", "o", "l"])
    readonly on_thumbstick_change = new Observable<AxisInputEvent>()

    readonly pointer_move = new Observable<PointerMovementEvent>()



    private constructor(
        xrHelper: WebXRDefaultExperience,
        scene: Scene,
    ){
        const im = this

        for(const button of [im.x_button, im.y_button, im.a_button, im.b_button]) {
            button._registerDocumentObserver()
            button.on_change.add((event) => im.on_button_change.notifyObservers(event))
        }

        for(const pressable of [im.left_trigger, im.right_trigger, im.left_squeeze, im.right_squeeze]) {
            pressable._registerDocumentObserver()
            pressable.on_change.add((event) => im.on_pressable_change.notifyObservers(event))
        }

        for(const trigger of [im.left_trigger, im.right_trigger])
            trigger.on_change.add((event) => im.on_trigger_change.notifyObservers(event))

        for(const squeeze of [im.left_squeeze, im.right_squeeze])
            squeeze.on_change.add((event) => im.on_squeeze_change.notifyObservers(event))
        
        for(const thumbstick of [im.left_thumbstick, im.right_thumbstick]) {
            thumbstick._registerDocumentObserver()
            thumbstick.on_change.add((event) => im.on_thumbstick_change.notifyObservers(event))
        }

        //// Notify the observers with the controllers inputs ////
        function initController(controller: WebXRInputSource){
            controller.onMotionControllerInitObservable.addOnce(()=>{
                const {motionController} = controller
                if(!motionController) return
                
                for(const button of [im.x_button, im.y_button, im.a_button, im.b_button]) {
                    button._registerXRObserver(motionController)
                }

                for(const pressable of [im.left_trigger, im.right_trigger, im.left_squeeze, im.right_squeeze]) {
                    pressable._registerXRObserver(motionController)
                }

                for(const axis of [im.left_thumbstick, im.right_thumbstick]) {
                    axis._registerXRObserver(motionController)
                }
                
            })
        }
        xrHelper.input.onControllerAddedObservable.add(initController)
        xrHelper.input.controllers.forEach(initController)

        //// Pointer movements ////
        let last_mouse_movement = Date.now()
        scene.onPointerObservable.add((event) => {
            if(event.type !== PointerEventTypes.POINTERMOVE) return // Only handle pointer move events

            // A pointer movement caused by the mouse will deactivate the XR controllers movements
            if(!event.pickInfo?.originMesh) last_mouse_movement = Date.now()
            else if(Date.now() - last_mouse_movement < 5000) return

            const origin = event.pickInfo?.ray?.origin!!
            const forward = event.pickInfo?.ray?.direction?.normalize()!!
            const right = forward.cross(Vector3.Up()).negateInPlace().normalize()
            const up = right.cross(forward).normalize()
            if(event.pickInfo)this.pointer_move.notifyObservers({origin, forward, up, right})
        })
    }
}