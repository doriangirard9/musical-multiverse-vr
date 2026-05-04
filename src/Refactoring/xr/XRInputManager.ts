import * as B from "@babylonjs/core";
import { XRControllerManager } from "./XRControllerManager";


export class XRInputManager {
    public leftController!: B.Nullable<B.WebXRInputSource>;
    public rightController!: B.Nullable<B.WebXRInputSource>;
    private _xrHelper: B.WebXRDefaultExperience;
    private _initialized: boolean = false;

    constructor(xrHelper: B.WebXRDefaultExperience) {
        this._xrHelper = xrHelper;

        // Configurer les écouteurs pour les contrôleurs
        this._setupControllerListeners();

        // Écouter les événements de session XR
        this._xrHelper.baseExperience.onStateChangedObservable.add((state) => {
            if (state === B.WebXRState.NOT_IN_XR) {
                // Réinitialiser le gestionnaire de contrôleurs quand on quitte la XR
                XRControllerManager.Instance.reset();
            }
        });
    }

    /**
     * Configure les écouteurs pour les événements d'ajout et de suppression de contrôleurs
     */
    private _setupControllerListeners(): void {
        this._xrHelper.input.onControllerAddedObservable.add((controller) => {
            controller.onMotionControllerInitObservable.addOnce(() => {
                if (controller.inputSource.handedness === 'left') {
                    this._updateLeftController(controller);
                } else if (controller.inputSource.handedness === 'right') {
                    this._updateRightController(controller);
                }
            });
        });

        // Écouter la suppression de contrôleurs
        this._xrHelper.input.onControllerRemovedObservable.add((controller) => {
            if (controller.inputSource.handedness === 'left') {
                this.leftController = null;
                XRControllerManager.Instance.updateLeftControllerStates(null);
            } else if (controller.inputSource.handedness === 'right') {
                this.rightController = null;
                XRControllerManager.Instance.updateRightControllerStates(null);
            }
        });
    }

    /**
     * Initialise les contrôleurs lorsqu'ils sont disponibles
     */
    public async initControllers(): Promise<void> {
        return new Promise((resolve) => {
            // Fonction qui vérifie périodiquement si les contrôleurs sont disponibles
            const checkControllers = () => {
                // Vérification directe des contrôleurs disponibles
                const controllers = this._xrHelper.input.controllers;

                if (controllers.length > 0) {
                    // Des contrôleurs sont disponibles, les traiter
                    let rightFound = false;
                    let leftFound = false;
                    let rightHasComponents = false;
                    let leftHasComponents = false;

                    controllers.forEach(controller => {
                        if (controller.inputSource.handedness === 'right' && !rightFound) {
                            rightFound = true;
                            this.rightController = controller;
                            if (controller.motionController) {
                                const component_ids = controller.motionController.getComponentIds();

                                // Vérifier si les composants ont des boutons
                                if (component_ids.length > 0) {
                                    rightHasComponents = true;
                                }
                            }
                        } else if (controller.inputSource.handedness === 'left' && !leftFound) {
                            leftFound = true;
                            this.leftController = controller;
                            if (controller.motionController) {
                                const component_ids = controller.motionController.getComponentIds();

                                if (component_ids.length > 0) {
                                    leftHasComponents = true;
                                }
                            }
                        }
                    });

                    const controllersReady = (rightFound && rightHasComponents) || (leftFound && leftHasComponents);
                    if (controllersReady) {
                        this._initialized = true;
                        resolve();
                        return true; // Arrêter la vérification périodique
                    } else {
                        return false; // Continuer à vérifier
                    }
                }

                return false; // Continuer à vérifier
            };

            if (checkControllers()) return;

            const interval = setInterval(() => {
                if (checkControllers()) {
                    clearInterval(interval);
                }
            }, 200);

            setTimeout(() => {
                clearInterval(interval);

                if (!this._initialized) {
                    console.log('Controller initialization timeout - proceeding with partial initialization');

                    this._initialized = true;
                    resolve();
                }
            }, 5000); // Timeout de 5 secondes

            const listenForMotionControllers = (controller: B.WebXRInputSource) => {
                controller.onMotionControllerInitObservable.add((_) => {
                    if (checkControllers()) {
                        clearInterval(interval);
                    }
                });
            };

            this._xrHelper.input.controllers.forEach(listenForMotionControllers);
            this._xrHelper.input.onControllerAddedObservable.add(listenForMotionControllers);
        });
    }

    /**
     * Met à jour le contrôleur gauche et le notifie au XRControllerManager
     */
    private _updateLeftController(controller: B.WebXRInputSource): void {
        this.leftController = controller;
        // Set the input source for haptic feedback
        XRControllerManager.Instance.setInputSource('left', controller.inputSource);
    }

    /**
     * Met à jour le contrôleur droit et le notifie au XRControllerManager
     */
    private _updateRightController(controller: B.WebXRInputSource): void {
        this.rightController = controller;
        // Set the input source for haptic feedback
        XRControllerManager.Instance.setInputSource('right', controller.inputSource);
    }

    /**
     * Affiche-les listenners pour le debug
     */
    public logRegisteredListeners(): void {
        console.log("--- Registered Button Listeners ---");

        const availableButtons = XRControllerManager.Instance.getAvailableButtons();
        availableButtons.forEach(buttonKey => {
            const listenerIds = XRControllerManager.Instance.getAvailableButtons()

            if (listenerIds.length > 0) {
                console.log(`${buttonKey}: ${listenerIds.join(', ')}`);
            }
        });

        console.log("--------------------------------");
    }
}