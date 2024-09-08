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
    }

    // Position the message plane in front of the camera
    private _positionMessageInFrontOfCamera(messagePlane: B.Mesh): void {
        const xrCameraPosition: B.Vector3 = this._xrManager.xrHelper.baseExperience.camera.position;
        const xrCameraDirection: B.Vector3 = this._xrManager.xrHelper.baseExperience.camera.getDirection(B.Axis.Z);

        // Adjust the plane's position and rotation based on the camera's direction
        const distanceFromCamera = 2; // Distance in front of the camera where the message should appear
        const messagePosition = xrCameraPosition.add(xrCameraDirection.scale(distanceFromCamera));

        messagePlane.position = messagePosition;

        // Make sure the message is facing the user
        messagePlane.rotationQuaternion = B.Quaternion.RotationYawPitchRoll(
            this._xrManager.xrHelper.baseExperience.camera.rotation.y,
            this._xrManager.xrHelper.baseExperience.camera.rotation.x,
            0
        );

        // Keep updating the message plane position as the user moves
        this._scene.onBeforeRenderObservable.add(() => {
            this._updateMessagePosition(messagePlane);
        });
    }

    private _updateMessagePosition(messagePlane: B.Mesh): void {
        const xrCameraPosition: B.Vector3 = this._xrManager.xrHelper.baseExperience.camera.position;
        const xrCameraDirection: B.Vector3 = this._xrManager.xrHelper.baseExperience.camera.getDirection(B.Axis.Z);

        const distanceFromCamera = 2;
        const messagePosition = xrCameraPosition.add(xrCameraDirection.scale(distanceFromCamera));

        messagePlane.position = messagePosition;

        // Ensure the message plane continues to face the camera
        messagePlane.rotationQuaternion = B.Quaternion.RotationYawPitchRoll(
            this._xrManager.xrHelper.baseExperience.camera.rotation.y,
            this._xrManager.xrHelper.baseExperience.camera.rotation.x,
            0
        );
    }
}
