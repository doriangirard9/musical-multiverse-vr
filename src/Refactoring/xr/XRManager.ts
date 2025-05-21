import {XRInputManager} from "./XRInputManager.ts";
import * as B from "@babylonjs/core";
import {withTimeout} from "../utils/utils.ts";



export class XRManager {
    private static _instance: XRManager;
    public xrInputManager!: XRInputManager;
    public xrHelper!: B.WebXRDefaultExperience;
    private _scene!: B.Scene;
    public xrFeaturesManager!: B.WebXRFeaturesManager;
    private _controllersInitialized: boolean = false;

    private constructor() {
    }

    public static getInstance(): XRManager {
        if (!this._instance) {
            this._instance = new XRManager();
        }
        return this._instance;
    }

    /**
     * Initialize the WebXR experience, XRInputs and XR features
     */
    public async init(scene: B.Scene): Promise<void> {
        console.log('Initializing XRManager...');
        this._scene = scene;

        try {
            // Ajouter timeout à l'initialisation de WebXR
            this.xrHelper = await withTimeout(
                this._getWebXRExperience(),
                10000, // 10 secondes
                undefined,
                "WebXR experience initialization timed out"
            );

            console.log('XRHelper initialized:', this.xrHelper);
            console.log('Camera:', this.xrHelper.baseExperience.camera);
            this._initXRFeatures();

            // Créer le XRInputManager mais ne pas encore initialiser les contrôleurs
            this.xrInputManager = new XRInputManager(this.xrHelper);
            console.log('XRInputManager initialized');

            this.xrHelper.baseExperience.camera.checkCollisions = true;
            this.xrHelper.baseExperience.camera.applyGravity = true;
            this.xrHelper.baseExperience.camera.ellipsoid = new B.Vector3(1, 1, 1);
            this.xrHelper.baseExperience.onStateChangedObservable.add((state) => {
                switch (state) {
                    case B.WebXRState.ENTERING_XR:
                        console.log('[*] XR STATE - Entering XR...');
                        break;
                    case B.WebXRState.IN_XR:
                        console.log('[*] XR STATE - In XR...');
                        // Besoin d'attendre qu'on soit dans en VR avant d'initialiser les contrôleurs
                        this._initControllersAfterXREntry();
                        break;
                    case B.WebXRState.EXITING_XR:
                        console.log("[*] XR STATE - Exiting XR...");
                        break;
                    case B.WebXRState.NOT_IN_XR:
                        console.log("[*] XR STATE - Not in XR...");
                        break;
                }
            });
        } catch (error) {
            console.error("XR initialization failed:", error);
        }
    }

    private async _initControllersAfterXREntry(): Promise<void> {
        if (this._controllersInitialized) {
            console.log('Controllers already initialized, skipping');
            return;
        }

        try {
            console.log('Initializing controllers after XR entry...');
            await withTimeout(
                this.xrInputManager.initControllers(),
                5000, // Timeout pour pas attendre a l'infini si il y a un soucis
                undefined,
                "Controller initialization timed out after XR entry"
            );
            console.log('Controllers initialized successfully');
            this._controllersInitialized = true;
        } catch (err) {
            console.warn("Controller initialization error after XR entry, running in degraded mode:", err);
            // Continuer en mode dégradé
            this._controllersInitialized = true; // évite de loop
        }
    }

    /**
     * Get the WebXR experience helper
     * @throws {Error} if WebXR is not supported
     */
    private async _getWebXRExperience(): Promise<B.WebXRDefaultExperience> {
        console.log('Checking WebXR support...');
        const isSupported: boolean = await B.WebXRSessionManager.IsSessionSupportedAsync('immersive-vr');
        if (!isSupported) {
            throw new Error('WebXR immersive-vr is not supported on this browser');
        }
        console.log('Creating WebXR experience for immersive-vr...');
        const xrExperience = await this._scene.createDefaultXRExperienceAsync({
            uiOptions: { sessionMode: 'immersive-vr' }
        });
        this.xrFeaturesManager = xrExperience.baseExperience.featuresManager;
        return xrExperience;
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
}