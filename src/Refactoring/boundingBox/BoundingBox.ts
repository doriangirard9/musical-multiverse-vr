import * as B from "@babylonjs/core";
import {AudioNode3D} from "../ConnecterWAM/AudioNode3D.ts";

import {Scene} from "@babylonjs/core";
import {SceneManager} from "../app/SceneManager.ts";
import {DragBoundingBox} from "./DragBoundingBox.ts";
import {RotateBoundingBox} from "./RotateBoundingBox.ts";
import {PlayerManager} from "../app/PlayerManager.ts";
import {XRControllerManager} from "../xr/XRControllerManager.ts";
import {XRManager} from "../xr/XRManager.ts";
import {XRInputStates} from "../xr/types.ts";



export class BoundingBox {
    private scene : Scene = SceneManager.getInstance().getScene();
    public boundingBox!: B.AbstractMesh;
    public dragBehavior!: DragBoundingBox;
    public rotationBehavior!: RotateBoundingBox;
    private id: string;
    private highlightLayer!: B.HighlightLayer;

    private readonly xButtonListenerId: string;
    private readonly bButtonListenerId: string;
    private readonly squeezeListenerId: string;

    constructor(private audioNode3D: AudioNode3D, id: string) {
        this.id = id;
        this.dragBehavior = new DragBoundingBox();
        this.rotationBehavior = new RotateBoundingBox();

        this.xButtonListenerId = `x-button-${this.id}`;
        this.bButtonListenerId = `b-button-${this.id}`;
        this.squeezeListenerId = `squeeze-${this.id}`;

        this.createBoundingBox();

        this.boundingBox.rotation.x = -Math.PI / 6;

        this.attachControllerBehaviors();

    }


    public createBoundingBox(): void {
        let w = this.audioNode3D.baseMesh.getBoundingInfo().boundingBox.extendSize.x * 2;
        let h = this.audioNode3D.baseMesh.getBoundingInfo().boundingBox.extendSize.y * 2;
        let d = this.audioNode3D.baseMesh.getBoundingInfo().boundingBox.extendSize.z * 2;

        const bbHeight = h + 0.1;
        const bbDepth = d + 0.8;

        this.boundingBox = B.MeshBuilder.CreateBox(`boundingBox${this.id}`, {
            width: w,
            height: bbHeight,
            depth: bbDepth
        }, this.scene);
        this.audioNode3D.baseMesh.parent = this.boundingBox;

        this.setupBoundingBoxProperties();
        this.setupBehaviors();
        this.positionBoundingBoxInFrontOfPlayer();
        this.setupShadows();
    }

    private setupBoundingBoxProperties(): void {
        this.boundingBox.isVisible = true;
        this.boundingBox.visibility = 0;
        this.boundingBox.isPickable = true;
        this.boundingBox.checkCollisions = true;
    }

    private setupBehaviors(): void {
        this.setupDragBehavior();
        this.addActionHandlers();
        this.attachControllerBehaviors();
    }

    private setupShadows(): void {
        this.boundingBox.getChildMeshes().forEach((_) => {
            //this._app.shadowGenerator.addShadowCaster(mesh);
        });
    }


    public attachControllerBehaviors(): void {
        console.log("Attaching controller behaviors in BoundingBox");
        this.attachXButtonHandler();
        this.attachBButtonHandler();
        this.attachSqueezeHandler();
    }
    private attachXButtonHandler(): void {
        if (XRControllerManager.Instance.hasButtonListener('left', 'x-button', this.xButtonListenerId)) {
            XRControllerManager.Instance.removeButtonListener('left', 'x-button', this.xButtonListenerId);
        }

        XRControllerManager.Instance.addButtonListener('left', 'x-button', this.xButtonListenerId, (event) => {
            if (event.pressed) {
                console.log(`X-button pressed on BoundingBox ${this.id}`);
                this._handleDelete();
            }
        });

        console.log(`X-button handler attached for BoundingBox ${this.id}`);
    }

    private attachBButtonHandler(): void {
        if (XRControllerManager.Instance.hasButtonListener('right', 'b-button', this.bButtonListenerId)) {
            XRControllerManager.Instance.removeButtonListener('right', 'b-button', this.bButtonListenerId);
        }

        XRControllerManager.Instance.addButtonListener('right', 'b-button', this.bButtonListenerId, (event) => {
            if (event.pressed) {
                console.log(`B-button pressed on BoundingBox ${this.id}`);
                this._handleDelete();
            }
        });

        console.log(`B-button handler attached for BoundingBox ${this.id}`);
    }

    private _lastSqueezeValue: number = 0;

    /**
     * Attache le handler du bouton Squeeze (contrôleur droit) pour gérer la rotation
     */
    private attachSqueezeHandler(): void {
        if (XRControllerManager.Instance.hasButtonListener('right', 'xr-standard-squeeze', this.squeezeListenerId)) {
            XRControllerManager.Instance.removeButtonListener('right', 'xr-standard-squeeze', this.squeezeListenerId);
        }

        XRControllerManager.Instance.setScene(SceneManager.getInstance().getScene());

        XRControllerManager.Instance.addButtonListener('right', 'xr-standard-squeeze', this.squeezeListenerId, (event) => {
            const value = event.value !== undefined ? event.value : (event.pressed ? 1 : 0);

            console.log(`Squeeze value: ${value}, last value: ${this._lastSqueezeValue}`);

            if (value === 1 && this._lastSqueezeValue < 1) {
                console.log(`Enabling rotation behavior for BoundingBox ${this.id}`);
                this._enableRotationBehavior();
            } else if (value < 1 && this._lastSqueezeValue === 1) {
                console.log(`Disabling rotation behavior for BoundingBox ${this.id}`);
                this._disableRotationBehavior();
            }

            this._lastSqueezeValue = value;
        });

        console.log(`Squeeze handler attached for BoundingBox ${this.id}`);
    }

    public addActionHandlers(): void {
        // Make sure the bounding box exists and actionManager is properly initialized
        console.log("Entered addActionHandlers BoundingBox.ts");
        if (!this.boundingBox || !this.scene) {
            console.error("Bounding box or scene not initialized properly");
            return;
        }

        // Create a highlight layer for pointer interactions
        this.highlightLayer = new B.HighlightLayer(`hl${this.id}`, this.scene);
        if (!this.boundingBox.actionManager) {
            try {
                console.log("doesnt have action manager", this.boundingBox.actionManager)
                this.boundingBox.actionManager = new B.ActionManager(this.scene);
            } catch (error) {
                console.error("Failed to initialize ActionManager:", error);
            }
        }

        try {
            // Pointer out action (remove highlight)
            this.boundingBox.actionManager!.registerAction(
                new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
                    this.highlightLayer.removeMesh(this.boundingBox as B.Mesh);
                })
            );
        } catch (error) {
            console.error("Failed to register pointer out action:", error);
        }

        // Right-click action (show or hide the menu)
        this.boundingBox.actionManager!.registerAction(
            new B.ExecuteCodeAction(B.ActionManager.OnRightPickTrigger, (): void => {
                console.log("right click on bounding box");
                this._handleDelete();
            })
        );

    }

    public confirmDelete() {
        const xrRightInputStates: XRInputStates = XRManager.getInstance().xrInputManager.rightInputStates;

        this.boundingBox.actionManager!.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
            console.log("pointer over", xrRightInputStates);
            xrRightInputStates['b-button'].onButtonStateChangedObservable.add((component: B.WebXRControllerComponent): void => {
                if (component.pressed) {
                    if (this.audioNode3D._isMenuOpen) this.audioNode3D._hideMenu();
                    else this.audioNode3D._showMenu();
                }
            });

        }));
    }


    private positionBoundingBoxInFrontOfPlayer(): void {
        // Check if player state is valid before proceeding
        const data = PlayerManager.getInstance()._getPlayerState();
        if (!data || !data.direction || !data.position) {
            console.warn("Player state is incomplete or invalid.");
            return;
        }

        // Calculate direction and position based on player state
        const direction = new B.Vector3(data.direction.x, data.direction.y, data.direction.z);
        const position = new B.Vector3(data.position.x, data.position.y + 0.3, data.position.z)
            .addInPlace(direction.normalize().scale(5));  // Place object in front of player

        // Apply transformations to the bounding box
        this.boundingBox.position = position;
        this.boundingBox.setDirection(direction);
        console.log("Changing rotation 2")

    }

    // Set up the drag behavior for the bounding box
    private setupDragBehavior(): void {
        this.boundingBox.addBehavior(this.dragBehavior);
    }

    // Enable drag behavior
    //@ts-ignore
    private _enableDragBehavior(): void {

        if (this.boundingBox && !this.boundingBox.behaviors.includes(this.dragBehavior)) {
            this.boundingBox.addBehavior(this.dragBehavior);
            console.log("enable drag behavior");
        }
    }

    // Disable drag behavior
    //@ts-ignore
    private _disableDragBehavior(): void {

        if (this.boundingBox && this.boundingBox.behaviors.includes(this.dragBehavior)) {
            //this.dragBehavior.detach();  // Detach the drag inputs
            this.boundingBox.removeBehavior(this.dragBehavior);  // Remove the behavior
            console.log("disable drag behavior");
        }
    }

// Enable rotation behavior
    private _enableRotationBehavior(): void {
        if (this.boundingBox && !this.boundingBox.behaviors.includes(this.rotationBehavior)) {
            this.boundingBox.addBehavior(this.rotationBehavior);
            console.log("enable rotation behavior");
        }
    }

// Disable rotation behavior
    private _disableRotationBehavior(): void {

        if (this.boundingBox && this.boundingBox.behaviors.includes(this.rotationBehavior)) {
            this.boundingBox.removeBehavior(this.rotationBehavior)  // Detach the drag inputs
            console.log("disable rotation behavior");
        }
    }


    private _handleDelete(): void {
        let controller = XRManager.getInstance().xrInputManager.rightController;
        if (!controller) return;
        const ray = new B.Ray(controller.pointer.position, controller.pointer.forward, 100);
        const pickResult = SceneManager.getInstance().getScene().pickWithRay(ray);

        if (pickResult && pickResult.pickedMesh && pickResult.pickedMesh === this.boundingBox) {
            this.audioNode3D._showMenu();
        }
    }

    public dispose(): void {
        XRControllerManager.Instance.removeButtonListener('left', 'x-button', this.xButtonListenerId);
        XRControllerManager.Instance.removeButtonListener('right', 'b-button', this.bButtonListenerId);
        XRControllerManager.Instance.removeButtonListener('right', 'xr-standard-squeeze', this.squeezeListenerId);

        // Supprimer les comportements
        if (this.boundingBox && this.boundingBox.behaviors) {
            if (this.boundingBox.behaviors.includes(this.dragBehavior)) {
                this.boundingBox.removeBehavior(this.dragBehavior);
            }
            if (this.boundingBox.behaviors.includes(this.rotationBehavior)) {
                this.boundingBox.removeBehavior(this.rotationBehavior);
            }
        }


        if (this.highlightLayer) {
            this.highlightLayer.dispose();
        }

        if (this.boundingBox) {
            this.boundingBox.dispose();
        }

        console.log(`BoundingBox ${this.id} disposed`);
    }

}
