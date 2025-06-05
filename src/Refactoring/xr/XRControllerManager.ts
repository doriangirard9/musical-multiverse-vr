import * as B from "@babylonjs/core";

interface IButtonEvent {
    name: string;
    pressed: boolean;
    value?: number;
    controller: 'left' | 'right';
}

interface IXRControllerStates {
    [buttonName: string]: B.WebXRControllerComponent;
}

type ButtonCallback = (event: IButtonEvent) => void;

/**
 * Gestionnaire de contrôleurs WebXR
 * Responsibility: Gestion centralisée des contrôleurs et des événements associés
 * Design pattern : Mediator https://refactoring.guru/design-patterns/mediator
 */
class XRControllerManager {
    private static _instance: XRControllerManager;

    private _leftControllerStates: IXRControllerStates | null = null;
    private _rightControllerStates: IXRControllerStates | null = null;
    private _buttonObservers: Map<string, Map<string, ButtonCallback>> = new Map();
    private _controllerObservers: Map<string, B.Observer<any>> = new Map();
    private _buttonStates: Map<string, boolean> = new Map();
    private _continuousObserver: B.Nullable<B.Observer<B.Scene>> = null;
    private _scene: B.Nullable<B.Scene> = null;
    private _activeAnalogButtons: Map<string, number> = new Map();

    private constructor() {}

    public static get Instance(): XRControllerManager {
        if (!XRControllerManager._instance) {
            XRControllerManager._instance = new XRControllerManager();
        }
        return XRControllerManager._instance;
    }

    public setScene(scene: B.Scene): void {
        this._scene = scene;
        this._setupContinuousTracking();
    }

    /**
     * Fonction spéciale pour le tracking du squeeze et trigger
     * Le squeeze et trigger ne sont pas des boutons binaires, mais analogiques.
     * Il faut donc suivre à chaque frame leur valeur
     */
    private _setupContinuousTracking(): void {
        if (!this._scene) return;

        if (this._continuousObserver) {
            this._scene.onBeforeRenderObservable.remove(this._continuousObserver);
            this._continuousObserver = null;
        }

        this._continuousObserver = this._scene.onBeforeRenderObservable.add(() => {
            if (this._activeAnalogButtons.size === 0) return;
            this._activeAnalogButtons.forEach((lastValue, key) => {
                const [controller, buttonName] = key.split('-') as ['left' | 'right', string];
                this._checkAnalogButtonState(controller, buttonName, lastValue);
            });
        });
    }

    /**
     * Vérifie l'état des boutons analogiques,
     * notifie les changements d'état et met à jour la valeur
     */
    private _checkAnalogButtonState(controller: 'left' | 'right', buttonName: string, lastValue: number): void {
        const states = controller === 'left' ? this._leftControllerStates : this._rightControllerStates;
        if (!states || !states[buttonName]) return;

        const component = states[buttonName];
        const currentValue = component.value;
        const key = `${controller}-${buttonName}`;

        // Si la valeur == 0, on peut retirer ce bouton du suivi
        if (currentValue === 0) {
            this._activeAnalogButtons.delete(key);

            // Si c'était précédemment non-nul, notifier du changement
            if (lastValue > 0) {
                this._notifyButtonObservers(controller, buttonName, false, 0);
            }
            return;
        }

        // Détecter les transitions de/vers 1
        if (currentValue === 1 && lastValue < 1) {
            this._notifyButtonObservers(controller, buttonName, true, 1);
        } else if (currentValue < 1 && lastValue === 1) {
            this._notifyButtonObservers(controller, buttonName, true, currentValue);
        }

        // Mettre à jour la dernière valeur connue
        this._activeAnalogButtons.set(key, currentValue);
    }

    /**
     * Met à jour l'état du contrôleur gauche
     * @param states Les nouveaux états du contrôleur
     */
    public updateLeftControllerStates(states: IXRControllerStates | null): void {
        // Détacher les anciens observers si nécessaire
        this._detachControllerObservers('left');
        this._leftControllerStates = states;

        // Attacher les nouveaux observers
        if (states) {
            this._attachControllerObservers('left', states);
        }
    }

    /**
     * Met à jour l'état du contrôleur droit
     * @param states Les nouveaux états du contrôleur
     */
    public updateRightControllerStates(states: IXRControllerStates | null): void {
        // Détacher les anciens observers si nécessaire
        this._detachControllerObservers('right');
        this._rightControllerStates = states;

        // Attacher les nouveaux observers
        if (states) {
            this._attachControllerObservers('right', states);
        }
    }

    /**
     * Ajoute un écouteur pour un bouton spécifique avec un identifiant unique
     * @param controller Le contrôleur ('left' ou 'right')
     * @param buttonName Le nom du bouton
     * @param idOrCallback L'identifiant du callback ou le callback lui-même
     * @param callbackOrNothing Le callback à appeler (si idOrCallback est un id)
     */
    public addButtonListener(
        controller: 'left' | 'right',
        buttonName: string,
        idOrCallback: string | ButtonCallback,
        callbackOrNothing?: ButtonCallback
    ): void {
        // Déterminer l'id et le callback en fonction des arguments
        let id: string;
        let callback: ButtonCallback;

        if (typeof idOrCallback === 'string') {
            // Cas où l'id est fourni
            id = idOrCallback;
            callback = callbackOrNothing as ButtonCallback;
        } else {
            // Cas où l'id n'est pas fourni
            id = `${controller}-${buttonName}-${Date.now()}`;
            callback = idOrCallback;
        }

        const buttonKey = `${controller}-${buttonName}`;

        // Initialiser la Map pour ce bouton si elle n'existe pas
        if (!this._buttonObservers.has(buttonKey)) {
            this._buttonObservers.set(buttonKey, new Map<string, ButtonCallback>());
        }

        // Stocker le callback avec son id
        this._buttonObservers.get(buttonKey)!.set(id, callback);

    }

    /**
     * Supprime un écouteur pour un bouton spécifique
     * @param controller Le contrôleur ('left' ou 'right')
     * @param buttonName Le nom du bouton
     * @param id L'identifiant du callback à supprimer
     */
    public removeButtonListener(
        controller: 'left' | 'right',
        buttonName: string,
        id: string
    ): void {
        const buttonKey = `${controller}-${buttonName}`;

        if (this._buttonObservers.has(buttonKey)) {
            this._buttonObservers.get(buttonKey)!.delete(id);
        }
    }

    /**
     * Attache des observateurs aux états des contrôleurs
     * @param controller Le contrôleur ('left' ou 'right')
     * @param states Les états du contrôleur
     */
    private _attachControllerObservers(controller: 'left' | 'right', states: IXRControllerStates): void {
        for (const buttonName in states) {
            const key = `${controller}-${buttonName}`;
            const component = states[buttonName];

            // Initialiser l'état du bouton s'il n'existe pas
            if (!this._buttonStates.has(key)) {
                this._buttonStates.set(key, component.pressed); // Récupérer l'état initial 0 | 1
            }

            // Créer et attacher un nouvel observateur
            const observer = component.onButtonStateChangedObservable.add((comp: B.WebXRControllerComponent): void => {
                const isPressed = comp.pressed;
                const value = comp.value;

                // Mettre à jour l'état du bouton
                this._buttonStates.set(key, isPressed);

                // Pour les boutons analogiques comme le squeeze ou le trigger
                if (buttonName === 'xr-standard-squeeze' || buttonName === 'trigger') {
                    // Si le bouton commence à être pressé, l'ajouter au suivi continu
                    if (value > 0) {
                        this._activeAnalogButtons.set(key, value);
                    } else {
                        // Si le bouton est relâché, le retirer du suivi continu
                        this._activeAnalogButtons.delete(key);
                    }
                }

                // Notifier les écouteurs du changement d'état
                this._notifyButtonObservers(controller, buttonName, isPressed, value);
            });

            // Stocker l'observateur pour pouvoir le détacher plus tard
            this._controllerObservers.set(key, observer);
        }
    }

    /**
     * Détache les observateurs d'un contrôleur
     * @param controller Le contrôleur ('left' ou 'right')
     */
    private _detachControllerObservers(controller: 'left' | 'right'): void {
        const states = controller === 'left' ? this._leftControllerStates : this._rightControllerStates;

        if (!states) return;

        for (const buttonName in states) {
            const key = `${controller}-${buttonName}`;
            const observer = this._controllerObservers.get(key);

            if (observer) {
                states[buttonName].onButtonStateChangedObservable.remove(observer);
                this._controllerObservers.delete(key);
            }

            // Retirer également du suivi continu
            this._activeAnalogButtons.delete(key);
        }
    }

    /**
     * Notifie tous les écouteurs d'un bouton
     * @param controller Le contrôleur ('left' ou 'right')
     * @param buttonName Le nom du bouton
     * @param pressed L'état du bouton (pressé ou non)
     * @param value La valeur du bouton (optionnelle, pour les bt analog)
     */
    private _notifyButtonObservers(
        controller: 'left' | 'right',
        buttonName: string,
        pressed: boolean,
        value?: number
    ): void {
        const buttonKey = `${controller}-${buttonName}`;
        const callbacksMap = this._buttonObservers.get(buttonKey);

        if (callbacksMap && callbacksMap.size > 0) {
            const event: IButtonEvent = {
                name: buttonName,
                pressed,
                value,
                controller
            };

            // Appeler chaque callback enregistré avec cet événement
            callbacksMap.forEach((callback, id) => {
                try {
                    callback(event);
                } catch (error) {
                    console.error(`Error in button listener "${id}" for ${controller} ${buttonName}:`, error);
                }
            });
        }
    }

    /**
     * Vérifie si un bouton a un écouteur avec l'identifiant spécifié
     * @param controller Le contrôleur ('left' ou 'right')
     * @param buttonName Le nom du bouton
     * @param id L'identifiant à vérifier
     * @returns true si l'écouteur existe, false sinon
     */
    public hasButtonListener(controller: 'left' | 'right', buttonName: string, id: string): boolean {
        const buttonKey = `${controller}-${buttonName}`;
        const callbacksMap = this._buttonObservers.get(buttonKey);

        return callbacksMap?.has(id) || false;
    }

    /**
     * Réinitialise tous les états et observateurs
     */
    public reset(): void {
        this._detachControllerObservers('left');
        this._detachControllerObservers('right');

        this._leftControllerStates = null;
        this._rightControllerStates = null;
        this._buttonStates.clear();
        this._activeAnalogButtons.clear();

    }

    /**
     * Nettoie les ressources lors de la destruction
     */
    public dispose(): void {
        this.reset();

        if (this._continuousObserver && this._scene) {
            this._scene.onBeforeRenderObservable.remove(this._continuousObserver);
            this._continuousObserver = null;
        }

        this._buttonObservers.clear();
        this._controllerObservers.clear();
        this._scene = null;
    }

    /**
     * Liste tous les boutons disponibles sur les contrôleurs actuels
     * @returns Un tableau de chaînes au format 'controller-buttonName'
     */
    public getAvailableButtons(): string[] {
        const buttons: string[] = [];

        // Ajouter les boutons du contrôleur gauche
        if (this._leftControllerStates) {
            for (const buttonName in this._leftControllerStates) {
                buttons.push(`left-${buttonName}`);
            }
        }

        // Ajouter les boutons du contrôleur droit
        if (this._rightControllerStates) {
            for (const buttonName in this._rightControllerStates) {
                buttons.push(`right-${buttonName}`);
            }
        }

        return buttons;
    }
}

export {XRControllerManager};
export type { IButtonEvent, ButtonCallback };
