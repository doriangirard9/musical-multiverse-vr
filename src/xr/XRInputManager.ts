import * as B from "@babylonjs/core";
import {XRInputStates} from "./types.ts";

export class XRInputManager {
    private _xrHelper: B.WebXRDefaultExperience;
    public leftController!: B.WebXRInputSource;
    public rightController!: B.WebXRInputSource;
    public rightInputStates!: XRInputStates;
    public leftInputStates!: XRInputStates;

    constructor(xrHelper: B.WebXRDefaultExperience) {
        this._xrHelper = xrHelper;
    }

    public async initControllers(): Promise<void> {
        return new Promise((resolve: () => void): void => {
            this._xrHelper.input.onControllerAddedObservable.add((controller : B.WebXRInputSource): void => {
                controller.onMotionControllerInitObservable.add((motionController: B.WebXRAbstractMotionController): void => {
                    const handedness: string = motionController.handedness;
                    if (handedness === 'left') {
                        this.leftController = controller;
                        this.leftInputStates = {};
                    } else if (handedness === 'right') {
                        this.rightController = controller;
                        this.rightInputStates = {};
                    }

                    const component_ids: string[] = motionController.getComponentIds();
                    const inputStates: XRInputStates = (handedness === 'left') ? this.leftInputStates : this.rightInputStates;

                    // add button state change listeners
                    component_ids.forEach((component_id: string): void => {
                        inputStates[component_id] = motionController.getComponent(component_id);
                    });

                    if (this.leftController && this.rightController) {
                        resolve();
                    }
                });
            });
        });
    }
}