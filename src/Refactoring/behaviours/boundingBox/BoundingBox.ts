import * as B from "@babylonjs/core";

import {Scene} from "@babylonjs/core";
import {SceneManager} from "../../app/SceneManager.ts";
import {DragBoundingBox} from "./DragBoundingBox.ts";
import {RotateBoundingBox} from "./RotateBoundingBox.ts";
import {PlayerManager} from "../../app/PlayerManager.ts";
import {XRControllerManager} from "../../xr/XRControllerManager.ts";



export class BoundingBox {
    private scene : Scene = SceneManager.getInstance().getScene();
    public boundingBox!: B.AbstractMesh;
    public dragBehavior!: DragBoundingBox;
    public rotationBehavior!: RotateBoundingBox;

    public on_move = ()=>{}
    public on_show_hitbox = ()=>{}
    public on_hide_hitbox = ()=>{}

    private readonly squeezeListenerId: string;

    constructor(private draggable: B.AbstractMesh) {
        this.dragBehavior = new DragBoundingBox();
        this.rotationBehavior = new RotateBoundingBox();
        this.squeezeListenerId = `squeeze`;
        this.createBoundingBox();
        this.boundingBox.rotation.x = -Math.PI / 6;
        this.attachControllerBehaviors();
        this.dragBehavior.on_move = ()=>this.on_move()
        this.rotationBehavior.on_move = ()=>this.on_move()
    }


    public createBoundingBox(): void {
        let w = this.draggable.getBoundingInfo().boundingBox.extendSize.x * 2
        let h = this.draggable.getBoundingInfo().boundingBox.extendSize.y * 2
        let d = this.draggable.getBoundingInfo().boundingBox.extendSize.z * 2

        this.boundingBox = B.MeshBuilder.CreateBox(`boundingBox`, {width:w+.01, height:h+.01, depth:d+.5}, this.scene)
        this.draggable.parent = this.boundingBox

        this.setupBoundingBoxProperties()
        this.setupBehaviors()
        this.positionBoundingBoxInFrontOfPlayer()
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

    public attachControllerBehaviors(): void {
        this.attachSqueezeHandler();
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
                console.log(`Enabling rotation behavior for BoundingBox `);
                this._enableRotationBehavior();
            } else if (value < 1 && this._lastSqueezeValue === 1) {
                console.log(`Disabling rotation behavior for BoundingBox `);
                this._disableRotationBehavior();
            }

            this._lastSqueezeValue = value;
        });

        console.log(`Squeeze handler attached for BoundingBox `);
    }

    public addActionHandlers(): void {
        // Make sure the bounding box exists and actionManager is properly initialized
        console.log("Entered addActionHandlers BoundingBox.ts");
        if (!this.boundingBox || !this.scene) {
            console.error("Bounding box or scene not initialized properly");
            return;
        }

        // Create a highlight layer for pointer interactions
        if (!this.boundingBox.actionManager) {
            try {
                console.log("doesnt have action manager", this.boundingBox.actionManager)
                this.boundingBox.actionManager = new B.ActionManager(this.scene);
            } catch (error) {
                console.error("Failed to initialize ActionManager:", error);
            }
        }
    }

    private positionBoundingBoxInFrontOfPlayer(): void {
        // Check if player state is valid before proceeding
        const data = PlayerManager.getInstance().getPlayerState();
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


    public dispose(): void {
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

        if (this.boundingBox) {
            this.boundingBox.dispose();
        }

        console.log(`BoundingBox  disposed`);
    }

}
