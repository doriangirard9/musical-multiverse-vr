import * as B from "@babylonjs/core";
import { XRInputManager } from "./XRInputManager";
import { XRInputStates } from "./types";
import { Menu } from "../Menu";
import { BoundingBox } from "../audioNodes3D/BoundingBox";

/**
 * ControllerBehaviorManager class
 * This class manages the behavior of the XR controllers.
 * Needed because the XR controllers are often reinitialized in XR environments (disconnection, Oculus button, etc.).
 * Also used to regroup all the behaviors needed.
 */
export class ControllerBehaviorManager {

    // Reference to the XRInputManager
    private _xrInputManager: XRInputManager;
    // States of the right controller inputs
    private _xrRightInputStates: XRInputStates;
    // States of the left controller inputs
    // @ts-ignore
    private _xrLeftInputStates: XRInputStates;
    // Reference to the application's menu
    private _menu: B.Nullable<Menu> = null;
    // Static list of BoundingBoxes to manage
    private static _boundingBoxes: BoundingBox[];

    /**
     * Constructor of the ControllerBehaviorManager class.
     * @param xrInputManager - Instance of XRInputManager to handle XR inputs.
     */
    constructor(xrInputManager: XRInputManager) {
        this._xrInputManager = xrInputManager;
        this._xrRightInputStates = this._xrInputManager.rightInputStates;
        this._xrLeftInputStates = this._xrInputManager.leftInputStates;
    }

    /**
     * Initializes the controller behaviors.
     * Attaches default behaviors and those of BoundingBoxes if they exist.
     */
    public init(): void {
        this._dummyBehavior();
        this._displayMenu();

        if (ControllerBehaviorManager._boundingBoxes) {
            this.attachBoundingBoxBehaviors();
        }
    }

    /**
     * Resets the input states of the controllers.
     * Used when the controllers are reconnected to ensure the states are up to date.
     */
    public reset(): void {
        this._xrRightInputStates = {};
        this._xrLeftInputStates = {};
    }

    /**
     * Updates the input states of the right controller.
     * @param states - New input states of the right controller.
     */
    public setxrRightInputStates(states: XRInputStates): void {
        this._xrRightInputStates = states;
    }

    /**
     * Updates the input states of the left controller.
     * @param states - New input states of the left controller.
     */
    public setxrLeftInputStates(states: XRInputStates): void {
        this._xrLeftInputStates = states;
    }

    /**
     * Adds a BoundingBox to the list of managed BoundingBoxes.
     * @param boundingBox - Instance of BoundingBox to add.
     */
    public static addBoundingBox(boundingBox: BoundingBox): void {
        if (!this._boundingBoxes) {
            this._boundingBoxes = [];
        }
        this._boundingBoxes.push(boundingBox);
    }

    /**
     * Sets the application's menu.
     * @param menu - Instance of Menu to associate.
     */
    public setMenu(menu: Menu): void {
        console.log("Setting menu");
        this._menu = menu;
    }

    /**
     * Attaches the behaviors of the controllers to all registered BoundingBoxes.
     */
    public attachBoundingBoxBehaviors(): void {
        ControllerBehaviorManager._boundingBoxes.forEach((boundingBox: BoundingBox) => {
            boundingBox.attachControllerBehaviors();
        });
    }

    /**
     * Attaches a dummy behavior to the 'a-button' of the right controller.
     * Used for testing or examples.
     */
    private _dummyBehavior(): void {
        console.log("Dummy behavior for: a-button");
        // Adds an observer to the 'a-button' of the right controller
        this._xrRightInputStates["a-button"].onButtonStateChangedObservable.add((component) => {
            if (component.value === 1) {
                console.log("DummyButton pressed");
            }
        });
    }

    /**
     * Attaches the behavior of displaying the menu to the 'a-button' of the right controller.
     */
    private _displayMenu(): void {
        // Adds an observer to the 'a-button' of the right controller to show or hide the menu
        this._xrRightInputStates['a-button'].onButtonStateChangedObservable.add((component: B.WebXRControllerComponent): void => {
            console.log('A button state changed on right controller');
            if (component.pressed) {
                console.log('A button pressed on right controller');
                console.log("Menu state is ", this._menu?.isMenuOpen);
                console.log("-----------------");
                if (!this._menu?.isMenuOpen) {
                    this._menu?.show();
                } else {
                    this._menu.hide();
                }
            }
        });
    }


}
