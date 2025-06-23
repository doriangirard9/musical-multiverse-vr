import { Quaternion, Vector3 } from "@babylonjs/core"
import { XRManager } from "../../xr/XRManager"
import { ButtonCallback, XRControllerManager } from "../../xr/XRControllerManager"
import { RandomUtils } from "../tools/utils/RandomUtils"

export type XRButton = "x-button"|"a-button"|"b-button"|"xr-standard-squeeze"|"xr-standard-trigger"|string

export class Player{
    
    private xrManager = XRManager.getInstance()

    private xrController = XRControllerManager.Instance

    private vrCamera = this.xrManager.xrHelper.baseExperience.camera



    //// Camera Position ////
    get cameraPosition(): Vector3 { return this.vrCamera.globalPosition.clone() }

    get cameraRotation(): Quaternion { return this.vrCamera.absoluteRotation.clone() }



    //// Controllers ////
    private listeners = new Map<string,["right"|"left",string]>()

    /**
     * Add a button listener to the specified controller.
     * [AUTOMATIC DISPOSAL]
     * @param controller The controller to listen to, either "right" or "left".
     * @param buttonName The name of the button to listen to, such as "x-button", "a-button", etc.
     * @param callback The callback function to execute when the button is pressed.
     * @returns The ID of the listener, which can be used to remove the listener later.
     */
    addButtonListener(controller: "right"|"left", buttonName: XRButton, callback: ButtonCallback): string{
        const id = RandomUtils.randomID()
        this.listeners.set(id,[controller,buttonName])
        this.xrController.addButtonListener(controller, buttonName, id, callback)
        return id
    }

    /**
     * Remove a button listener from the specified controller.
     * @param id The ID of the listener to remove, which was returned when the listener was added.
     * @returns 
     */
    removeButtonListener(id: string): void {
        const entry = this.listeners.get(id)
        if(!entry) return
        const [controller, buttonName] = entry
        this.xrController.removeButtonListener(controller, buttonName, id)
        this.listeners.delete(id)
    }

    /**
     * Get the list of all available buttons on the controller.
     * @returns An array of strings representing the available buttons, such as ["x-button", "a-button", etc.].
     */
    get availableButtons(){ return this.xrController.getAvailableButtons() }

    dispose(){
        for(const key of this.listeners.keys()) this.removeButtonListener(key)
    }
}