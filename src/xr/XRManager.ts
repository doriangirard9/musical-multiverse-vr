import { XRInputManager } from "./XRInputManager.ts";
import * as B from "@babylonjs/core";

export class XRManager {
    private static _instance: XRManager;
    public xrInputManager!: XRInputManager;
    public xrHelper!: B.WebXRDefaultExperience;
    private _scene!: B.Scene;
    public xrFeaturesManager!: B.WebXRFeaturesManager;
    private _audioCtx!: AudioContext;

    private constructor() {}

    public static getInstance(): XRManager {
        if (!this._instance) {
            this._instance = new XRManager();
        }
        return this._instance;
    }

    /**
     * Initialize the WebXR experience, XRInputs and XR features
     */
    public async init(scene: B.Scene, audioCtx: AudioContext): Promise<void> {
        this._scene = scene;
        this._audioCtx = audioCtx; // Assign audio context
        this.xrHelper = await this._getWebXRExperience();
        this._initXRFeatures();
        this.xrInputManager = new XRInputManager(this.xrHelper);

        this.xrHelper.baseExperience.camera.checkCollisions = true;
        this.xrHelper.baseExperience.camera.applyGravity = true;
        this.xrHelper.baseExperience.camera.ellipsoid = new B.Vector3(1, 1, 1);
        await this.xrInputManager.initControllers();

        this._initListenerUpdate();  // Initialize listener updates here
    }

    /**
     * Get the WebXR experience helper
     * @throws {Error} if WebXR is not supported
     */
    private async _getWebXRExperience(): Promise<B.WebXRDefaultExperience> {
        const isSupported: boolean = await B.WebXRSessionManager.IsSessionSupportedAsync('immersive-ar');
        if (!isSupported) {
            const errorMessage: string = 'WebXR is not supported on this browser';
            throw new Error(errorMessage);
        } else {
            const xrExperience = await this._scene.createDefaultXRExperienceAsync();

            // Attempt to disable movement features
            // Explicitly disable movement and other features if enabled by default
            this.xrFeaturesManager = xrExperience.baseExperience.featuresManager;
            return xrExperience;
        }
    }

    private _initXRFeatures(): void {
        const featuresManager: B.WebXRFeaturesManager = this.xrHelper.baseExperience.featuresManager;
        featuresManager.disableFeature(B.WebXRFeatureName.TELEPORTATION);
        featuresManager.enableFeature(B.WebXRFeatureName.MOVEMENT, "latest", {
            xrInput: this.xrHelper.input,
            movementSpeed: 0.2,
            rotationSpeed: 0.3,
        });
    }

    /**
     * Explicitly update audio listener's position and orientation based on XR camera
     */
    private _initListenerUpdate(): void {
        if (!this._audioCtx) {
            console.error("AudioContext is undefined in XRManager!");
            return;
        }

        this._scene.onBeforeRenderObservable.add(() => {
            const xrCamera = this.xrHelper.baseExperience.camera;

            const listener = this._audioCtx.listener;

            // Ensure XR camera exists
            if (!xrCamera) {
                console.error("xrCamera is undefined in XRManager!");
                return;
            }

            // Listener Position Update
            const pos = xrCamera.position;
            listener.positionX.setValueAtTime(pos.x, this._audioCtx.currentTime);
            listener.positionY.setValueAtTime(pos.y, this._audioCtx.currentTime);
            listener.positionZ.setValueAtTime(pos.z, this._audioCtx.currentTime);

            // Listener Orientation Update
            const forward = xrCamera.getForwardRay().direction;
            const up = xrCamera.upVector;

            listener.forwardX.setValueAtTime(forward.x, this._audioCtx.currentTime);
            listener.forwardY.setValueAtTime(forward.y, this._audioCtx.currentTime);
            listener.forwardZ.setValueAtTime(forward.z, this._audioCtx.currentTime);

            listener.upX.setValueAtTime(up.x, this._audioCtx.currentTime);
            listener.upY.setValueAtTime(up.y, this._audioCtx.currentTime);
            listener.upZ.setValueAtTime(up.z, this._audioCtx.currentTime);
        });
    }
}
