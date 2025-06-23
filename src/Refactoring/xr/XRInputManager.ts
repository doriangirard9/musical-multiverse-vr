import * as B from "@babylonjs/core";
import { XRInputStates } from "./types.ts";
import { XRControllerManager } from "./XRControllerManager";
import menuJson from "./menuConfig.json";
import {MainMenu} from "../menus/MainMenu.ts";
import {MenuConfig} from "../shared/SharedTypes.ts";
import {MenuEventBus} from "../eventBus/MenuEventBus.ts";


export class XRInputManager {
    public leftController!: B.Nullable<B.WebXRInputSource>;
    public rightController!: B.Nullable<B.WebXRInputSource>;
    public rightInputStates!: XRInputStates;
    public leftInputStates!: XRInputStates;
    private _xrHelper: B.WebXRDefaultExperience;
    private _initialized: boolean = false;
    private _menu: B.Nullable<MainMenu> = null; // Menu principal pour placer les wams

    // Identifiants des écouteurs pour pouvoir les supprimer spécifiquement si nécessaire
    private readonly MENU_TOGGLE_ID = "menu-toggle";
    private readonly DUMMY_BEHAVIOR_ID = "dummy-behavior";

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
                this.leftInputStates = {};
                XRControllerManager.Instance.updateLeftControllerStates(null);
            } else if (controller.inputSource.handedness === 'right') {
                this.rightController = null;
                this.rightInputStates = {};
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
                                this.rightInputStates = {};

                                // Vérifier si les composants ont des boutons
                                if (component_ids.length > 0) {
                                    rightHasComponents = true;
                                    component_ids.forEach(id => {
                                        const component = controller.motionController!.getComponent(id);
                                        if (component) {
                                            this.rightInputStates[id] = component;
                                        }
                                    });
                                }
                            }
                        } else if (controller.inputSource.handedness === 'left' && !leftFound) {
                            leftFound = true;
                            this.leftController = controller;
                            if (controller.motionController) {
                                const component_ids = controller.motionController.getComponentIds();
                                this.leftInputStates = {};

                                if (component_ids.length > 0) {
                                    leftHasComponents = true;
                                    component_ids.forEach(id => {
                                        const component = controller.motionController!.getComponent(id);
                                        if (component) {
                                            this.leftInputStates[id] = component;
                                        }
                                    });
                                }
                            }
                        }
                    });

                    const controllersReady = (rightFound && rightHasComponents) || (leftFound && leftHasComponents);
                    if (controllersReady) {
                        this._initialized = true;

                        // Mettre à jour XRControllerManager avec les états actuels
                        if (rightFound && this.rightInputStates) {
                            XRControllerManager.Instance.updateRightControllerStates(this.rightInputStates);
                        }
                        if (leftFound && this.leftInputStates) {
                            XRControllerManager.Instance.updateLeftControllerStates(this.leftInputStates);
                        }

                        // Initialiser le menu et les comportements
                        this._initializeMenu();
                        //this._initializeDummyBehavior(); // Non util pour l'instant
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

                    // Tenter une dernière initialisation avec ce qu'on a
                    if (this.rightController || this.leftController) {
                        // Mettre à jour XRControllerManager avec ce qu'on a
                        if (this.rightInputStates) {
                            XRControllerManager.Instance.updateRightControllerStates(this.rightInputStates);
                        }
                        if (this.leftInputStates) {
                            XRControllerManager.Instance.updateLeftControllerStates(this.leftInputStates);
                        }

                        // Initialiser le menu et les comportements
                        this._initializeMenu();
                        //this._initializeDummyBehavior(); // Non util pour l'instant
                    }

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
        this.leftInputStates = {};

        if (controller.motionController) {
            const component_ids = controller.motionController.getComponentIds();
            component_ids.forEach(id => {
                const component = controller.motionController!.getComponent(id);
                if (component) {
                    this.leftInputStates[id] = component;
                }
            });
        }

        XRControllerManager.Instance.updateLeftControllerStates(this.leftInputStates);
    }

    /**
     * Met à jour le contrôleur droit et le notifie au XRControllerManager
     */
    private _updateRightController(controller: B.WebXRInputSource): void {
        this.rightController = controller;
        this.rightInputStates = {};

        if (controller.motionController) {
            const component_ids = controller.motionController.getComponentIds();
            component_ids.forEach(id => {
                const component = controller.motionController!.getComponent(id);
                if (component) {
                    this.rightInputStates[id] = component;
                }
            });
        }

        XRControllerManager.Instance.updateRightControllerStates(this.rightInputStates);
    }

    /**
     * Initialise le menu et attache les comportements associés
     */
    private _initializeMenu(): void {
        if (!this._menu) {
            this._menu = new MainMenu(menuJson as MenuConfig);
        }

        if (XRControllerManager.Instance.hasButtonListener('right', 'a-button', this.MENU_TOGGLE_ID)) {
            XRControllerManager.Instance.removeButtonListener('right', 'a-button', this.MENU_TOGGLE_ID);
        }

        // Attacher le comportement de menu au bouton A du contrôleur droit avec un ID spécifique
        XRControllerManager.Instance.addButtonListener('right', 'a-button', this.MENU_TOGGLE_ID, (event) => {
            if (event.pressed) {
                console.log("Bouton A pressé sur le contrôleur droit");
                /*
                    Laisser la gestion ici ou passer par l'eventBus pour gérer ça ailleurs ?
                 */
                if (!this._menu!.isMenuOpen) {
                    this._menu!.show();
                    MenuEventBus.getInstance().emit('MAIN_MENU_ENABLE', { enable: true });
                } else {
                    this._menu!.hide();
                    MenuEventBus.getInstance().emit('MAIN_MENU_DISABLE', { disable: true });
                }
            }
        });

    }

    //@ts-ignore unused
    private _initializeDummyBehavior(): void {

        if (XRControllerManager.Instance.hasButtonListener('right', 'a-button', this.DUMMY_BEHAVIOR_ID)) {
            XRControllerManager.Instance.removeButtonListener('right', 'a-button', this.DUMMY_BEHAVIOR_ID);
        }

        XRControllerManager.Instance.addButtonListener('right', 'a-button', this.DUMMY_BEHAVIOR_ID, (event) => {
            if (event.pressed) {
                console.log("DummyButton pressé");
            }
        });
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