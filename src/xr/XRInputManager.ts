import * as B from "@babylonjs/core";
import {XRInputStates} from "./types.ts";
import {ControllerBehaviorManager} from "./BehaviorControllerManager.ts";

export class XRInputManager {
    public leftController!: B.Nullable<B.WebXRInputSource>;
    public rightController!: B.Nullable<B.WebXRInputSource>;
    public rightInputStates!: XRInputStates;
    public leftInputStates!: XRInputStates;
    public controllerBehaviorManager: B.Nullable<ControllerBehaviorManager> = null;
    private _xrHelper: B.WebXRDefaultExperience;
    private _initialized: boolean = false;

    constructor(xrHelper: B.WebXRDefaultExperience) {
        this._xrHelper = xrHelper;

    }

    public async initControllers(): Promise<void> {
        return new Promise((resolve: () => void): void => {
            this._xrHelper.input.onControllerAddedObservable.add((controller: B.WebXRInputSource): void => {
                controller.onMotionControllerInitObservable.add((motionController: B.WebXRAbstractMotionController): void => {
                    if (this._initialized) {
                        this.leftController = null
                        this.rightController = null
                        this.rightInputStates = {}
                        this.leftInputStates = {}
                        this.controllerBehaviorManager?.reset()
                        this._initialized = false
                    }
                    const handedness: string = motionController.handedness;
                    if (handedness === 'left') {
                        this.leftController = controller;
                        this.leftInputStates = {};
                        console.log('Left controller found');
                    } else if (handedness === 'right') {
                        this.rightController = controller;
                        this.rightInputStates = {};
                        console.log('Right controller found');
                    }

                    if (motionController) {
                        console.log('Motion controller found');
                        const component_ids: string[] = motionController.getComponentIds();
                        const inputStates: XRInputStates = (handedness === 'left') ? this.leftInputStates : this.rightInputStates;

                        // add button state change listeners
                        component_ids.forEach((component_id: string): void => {
                            const component = motionController.getComponent(component_id);
                            if (component) {
                                inputStates[component_id] = component;
                            }
                        });

                    } else {
                        console.log('No motion controller found');
                    }

                    if (this.leftController && this.rightController) {
                        this._initialized = true;
                        if (!this.controllerBehaviorManager) this.controllerBehaviorManager = new ControllerBehaviorManager(this);
                        this.controllerBehaviorManager.setxrRightInputStates(this.rightInputStates);
                        this.controllerBehaviorManager.setxrLeftInputStates(this.leftInputStates);
                        this.controllerBehaviorManager.init();
                        resolve();
                    }
                });
            });
        });
    }


}