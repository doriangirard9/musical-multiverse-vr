import { AbstractMesh, Immutable, Observable, Scene, Vector3, WebXRDefaultExperience, WebXRInputSource } from "@babylonjs/core";
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
    /** The x button input. */
    readonly x_button = new ButtonInput("x-button", "left", "x")

    /** The y button input. */
    readonly y_button = new ButtonInput("y-button", "left", "y")

    /** The a button input. */
    readonly a_button = new ButtonInput("a-button", "right", "a")

    /** The b button input. */
    readonly b_button = new ButtonInput("b-button", "right", "b")

    /** The observable that is notified when any button changes state. */
    readonly on_button_change = new Observable<ButtonInputEvent>()

    /** The left controller input. */
    readonly left = new ControllerInput("left")

    /** The right controller input. */
    readonly right = new ControllerInput("right")

    /** The screen controller input. Controlled by the mouse and keyboard. */
    readonly screen = new ControllerInput("none")

    /** Returns an array of all controllers. */
    get controllers() { return [this.left, this.right, this.screen] }

    /** The observable that is notified when any trigger changes state. */
    readonly onTriggerChange = new Observable<PressableInputEvent>()
    readonly onTriggerDown = new Observable<PressableInputEvent>()
    readonly onTriggerUp = new Observable<PressableInputEvent>()

    /** The observable that is notified when any squeeze changes state. */
    readonly onSqueezeChange = new Observable<PressableInputEvent>()
    readonly onSqueezeDown = new Observable<PressableInputEvent>()
    readonly onSqueezeUp = new Observable<PressableInputEvent>()

    /** The observable that is notified when any pressable (trigger or squeeze) input changes state. */
    readonly onPressableChange = new Observable<PressableInputEvent>()

    /** The observable that is notified when any thumbstick changes state. */
    readonly onThumbstickChange = new Observable<AxisInputEvent>()

    /** The observable that is notified when any pointer input gets a new target. */
    readonly onNewtarget = new Observable<PointerInput>()

    /** The observable that is notified when a target is entered for the first time since the last exit. */
    readonly onEnterTarget = new Observable<{target:AbstractMesh,pointer:PointerInput}>()

    /** The observable that is notified when a target is exited for the last time since the last enter. */
    readonly onExitTarget = new Observable<{target:AbstractMesh,pointer:PointerInput}>()

    /** A list of the meshes currently being pointed at by any controller. */
    get pointedMeshes() { return Array.from(this._pointeds.keys()) }

    private _pointeds = new Map<AbstractMesh,number>()

    private constructor(
        xrHelper: WebXRDefaultExperience,
        scene: Scene,
    ){
        const im = this
        
        // Link observers
        for(const button of [im.x_button, im.y_button, im.a_button, im.b_button]) {
            button.onChange.add((event) => im.on_button_change.notifyObservers(event))
        }

        for(const controller of [im.left, im.right, im.screen]) {
            controller._registerDocumentObserver(scene)

            controller.thumbstick.on_change.add((event) => im.onThumbstickChange.notifyObservers(event))

            controller.squeeze.onChange.add((event) => im.onSqueezeChange.notifyObservers(event))
            controller.squeeze.onDown.add((event) => im.onSqueezeDown.notifyObservers(event))
            controller.squeeze.onUp.add((event) => im.onSqueezeUp.notifyObservers(event))

            controller.trigger.onChange.add((event) => im.onTriggerChange.notifyObservers(event))
            controller.trigger.onDown.add((event) => im.onTriggerDown.notifyObservers(event))
            controller.trigger.onUp.add((event) => im.onTriggerUp.notifyObservers(event))

            controller.onPressableChange.add((event) => im.onPressableChange.notifyObservers(event))

            controller.pointer.onNewTarget.add((event) =>{
                im.onNewtarget.notifyObservers(event)
                
                // Previous
                if(event.previousMesh!=null){
                    const newCount = (im._pointeds.get(event.previousMesh)??1)-1
                    if(newCount==0){
                        im._pointeds.delete(event.previousMesh)
                        im.onExitTarget.notifyObservers({target: event.previousMesh, pointer: event})
                    }
                    else im._pointeds.set(event.previousMesh, newCount)
                }

                // New
                if(event.targetMesh!=null){
                    const newCount = (im._pointeds.get(event.targetMesh)??0)+1
                    if(newCount==1){
                        im.onEnterTarget.notifyObservers({target: event.targetMesh, pointer: event})
                    }
                    im._pointeds.set(event.targetMesh, newCount)
                }
            })
        }

        // Register document observers
        scene.preventDefaultOnPointerDown = false

        for(const button of [im.x_button, im.y_button, im.a_button, im.b_button]) {
            button._registerDocumentObserver()
        }

        this.screen._registerDocumentObserver(
            scene,
            0,2,
            null,
            false,
            true,
        )

        this.left._registerDocumentObserver(
            scene,
            null,null,
            ["q", "d", "z", "s"],
        )

        this.right._registerDocumentObserver(
            scene,
            null,null,
            ["arrowleft", "arrowright", "arrowup", "arrowdown"],
        )

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