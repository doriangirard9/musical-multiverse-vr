/**
 * The differents classes revolving around {@link InputManager}, which is responsible for managing user inputs, whether in VR or on screen.
 * It allows retrieving the position and orientation of controllers, pressed buttons, etc.
 * @module inputs
 */

import { AbstractMesh, Immutable, Nullable, Observable, Scene, Vector3, WebXRDefaultExperience, WebXRInputSource } from "@babylonjs/core";
import { ButtonInput, ButtonInputEvent } from "./ButtonInput";
import { PressableInputEvent } from "./PressableInput";
import { AxisInputEvent } from "./AxisInput";
import { ControllerInput } from "./ControllerInput";
import { PointerInput } from "./PointerInput";
import { AbstractPointerInput } from "./AbstractPointerInput";
import { InputCapability } from "./InputCapability";
import { XRManager } from "../XRManager";

export interface PointerMovementEvent {
    origin: Immutable<Vector3>,
    forward: Immutable<Vector3>,
    up: Immutable<Vector3>,
    right: Immutable<Vector3>,
    target: Immutable<Vector3>,
}

/**
 * Responsible for managing user inputs.
 * Allows retrieving the position and orientation of controllers, pressed buttons, etc.
 * 
 * This abstraction also enables unified input management, whether in VR or on screen, and creates a link between the two (for example by simulating a controller input based on the mouse pointer position).
 */
export class InputManager {


    //// CAPABILITIES ////
    readonly movement  = new InputCapability()

    //// SINGLETON ////
    private static instance: InputManager;
        
    public static getInstance(): InputManager { return this.instance }

    public static create(xrHelper: Nullable<WebXRDefaultExperience>, scene: Scene[]) { this.instance = new InputManager(xrHelper, scene) }
    
    
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

    /** The camera pointer input. Controlled by the camera's forward direction. */
    readonly head = new AbstractPointerInput()

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
    readonly onNewTarget = new Observable<PointerInput>()

    /** The observable that is notified when any pointer input touch a new target. */
    readonly onNewTouch = new Observable<PointerInput>()

    /** The observable that is notified when a target is entered for the first time since the last exit. */
    readonly onEnterTarget = new Observable<{target:AbstractMesh,pointer:PointerInput}>()

    /** The observable that is notified when a target is exited for the last time since the last enter. */
    readonly onExitTarget = new Observable<{target:AbstractMesh,pointer:PointerInput}>()

    /** A list of the meshes currently being pointed at by any controller. */
    get pointedMeshes() { return Array.from(this._pointeds.keys()) }

    private _pointeds = new Map<AbstractMesh,number>()

    private constructor(
        xrHelper: Nullable<WebXRDefaultExperience>,
        scenes: Scene[],
    ){
        const im = this
        
        // Link observers
        for(const button of [im.x_button, im.y_button, im.a_button, im.b_button]) {
            button.onChange.add((event) => im.on_button_change.notifyObservers(event))
        }

        for(const controller of [im.left, im.right, im.screen]) {
            controller._registerDocumentObserver(scenes)

            controller.thumbstick.on_change.add((event) => im.onThumbstickChange.notifyObservers(event))

            controller.squeeze.onChange.add((event) => im.onSqueezeChange.notifyObservers(event))
            controller.squeeze.onDown.add((event) => im.onSqueezeDown.notifyObservers(event))
            controller.squeeze.onUp.add((event) => im.onSqueezeUp.notifyObservers(event))

            controller.trigger.onChange.add((event) => im.onTriggerChange.notifyObservers(event))
            controller.trigger.onDown.add((event) => im.onTriggerDown.notifyObservers(event))
            controller.trigger.onUp.add((event) => im.onTriggerUp.notifyObservers(event))

            controller.onPressableChange.add((event) => im.onPressableChange.notifyObservers(event))

            controller.pointer.onNewTarget.add((event) =>{
                im.onNewTarget.notifyObservers(event)
                
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

            controller.pointer.onNewTouch.add((event) =>{
                im.onNewTouch.notifyObservers(event)
            })
        }

        // Register document observers : based on key presses and mouse events
        this._registerDocument(scenes)
        
        // Register XR observers : based on XR controller events
        if (xrHelper) {
            this._registerXR(xrHelper, XRManager.getInstance(), scenes)
        }

        // General scene control : based on camera per example
        this._registerScene(scenes)
    }

    _registerDocument(scenes: Scene[]){
        const im = this

        for(const scene of scenes){
            scene.skipPointerDownPicking = true
            scene.skipPointerUpPicking = true
            scene.preventDefaultOnPointerDown = false
            scene.preventDefaultOnPointerUp = false
        }

        for(const button of [im.x_button, im.y_button, im.a_button, im.b_button]) {
            button._registerDocumentObserver()
        }

        this.screen._registerDocumentObserver(
            scenes,
            0,2,
            null,
            false,
            true,
        )

        this.left._registerDocumentObserver(
            scenes,
            null,null,
            ["q", "d", "z", "s"],
        )

        this.right._registerDocumentObserver(
            scenes,
            null,null,
            ["arrowleft", "arrowright", "arrowup", "arrowdown"],
        )

        im.right.thumbstick._registerMouseWheelObserver()
    }

    _registerXR(xrHelper: WebXRDefaultExperience, xrManager: XRManager, scenes: Scene[]){
        const im = this

        function initController(controller: WebXRInputSource){
            controller.onMotionControllerInitObservable.addOnce(()=>{
                const {motionController} = controller
                if(!motionController) return
                
                for(const button of [im.x_button, im.y_button, im.a_button, im.b_button]) {
                    button._registerXRObserver(motionController)
                }

                for(const cinput of [im.left, im.right]) {
                    cinput._registerXRObserver(controller, scenes)
                }
                
            })
        }

        xrHelper.input.onControllerAddedObservable.add(initController)

        xrHelper.input.controllers.forEach(initController)

        {
            this.movement.onEnable.add(() => {
                xrManager.setMovement(["rotation","translation"])
            })
            this.movement.onDisable.add(() => {
                xrManager.setMovement([])
            })
        }
    }

    _registerScene(scenes: Scene[]){
        this.head._registerCameraObserver(scenes)
    }
        
}
