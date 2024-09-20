import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import { XRManager } from "./xr/XRManager.ts";

export class MessageManager {
    private _scene: B.Scene;
    private _xrManager: XRManager;
    private _currentMessagePlane?: B.Mesh;
    private _advancedTexture?: GUI.AdvancedDynamicTexture;

    constructor(scene: B.Scene, xrManager: XRManager) {
        this._scene = scene;
        this._xrManager = xrManager;
    }

    // Display a message in front of the user's XR camera
// Display a message in front of the user's XR camera
public showMessage(messageText: string, duration: number=0): void {
    // Remove any existing message plane
    if (this._currentMessagePlane) {
        this.hideMessage();
    }

    // Increase the plane size to accommodate larger text
    const messagePlane = B.MeshBuilder.CreatePlane("messagePlane", { width: 4, height: 2 }, this._scene); // Increase width and height of the plane
    this._currentMessagePlane = messagePlane;

    // Create an AdvancedDynamicTexture and add the TextBlock to it
    this._advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(messagePlane);
    const message = new GUI.TextBlock();
    message.text = messageText;
    message.color = "white";

    // Increase font size
    message.fontSize = 150;  // Keep the large font size
    message.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER; // Center align the text
    message.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER; // Center align vertically

    // Enable text wrapping to fit within the plane
    message.textWrapping = true;

    // Add some padding to avoid text touching the edges
    message.paddingTop = "20px";
    message.paddingBottom = "20px";
    message.paddingLeft = "20px";
    message.paddingRight = "20px";

    this._advancedTexture.addControl(message);

    // Set the initial position of the plane in front of the camera
    this._positionMessageInFrontOfCamera(messagePlane);

    // Optionally, auto-hide message after a duration
    if(duration && duration > 0)
    setTimeout(() => {
        this.hideMessage();
    }, duration);
}


    // Hide the message by removing the plane from the scene
    public hideMessage(): void {
        if (this._currentMessagePlane) {
            this._currentMessagePlane.dispose();
            this._currentMessagePlane = undefined;
        }
        if (this._advancedTexture) {
            this._advancedTexture.dispose();
            this._advancedTexture = undefined;
        }
        this._removeMessagePlaneObserver();
    }

    // Position the message plane in front of the camera
    private _messagePlaneObserver: B.Nullable<B.Observer<B.Scene>> = null;

    private _positionMessageInFrontOfCamera(messagePlane: B.Mesh): void {
        const camera = this._xrManager.xrHelper.baseExperience.camera;
        const distanceFromCamera = 2;
        /**
         * https://doc.babylonjs.com/features/featuresDeepDive/mesh/billboardMode
         * Mesh.BILLBOARDMODE_ALL: The object's position is set at the camera position. It always faces the camera
         */
        messagePlane.billboardMode = B.Mesh.BILLBOARDMODE_ALL;

        messagePlane.position = camera.getFrontPosition(distanceFromCamera);

        if (!this._messagePlaneObserver) {
            this._messagePlaneObserver = this._scene.onBeforeRenderObservable.add(() => {
                this._updateMessagePosition(messagePlane, distanceFromCamera);
            });
        }
    }

    private _updateMessagePosition(messagePlane: B.Mesh, distanceFromCamera: number): void {
        const camera = this._xrManager.xrHelper.baseExperience.camera;
        messagePlane.position = camera.getFrontPosition(distanceFromCamera);
    }

    private _removeMessagePlaneObserver(): void {
        if (this._messagePlaneObserver) {
            this._scene.onBeforeRenderObservable.remove(this._messagePlaneObserver);
            this._messagePlaneObserver = null;
        }
    }

}
