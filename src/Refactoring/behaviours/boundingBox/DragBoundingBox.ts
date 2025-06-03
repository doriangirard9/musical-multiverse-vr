import * as B from "@babylonjs/core";
import {SceneManager} from "../../app/SceneManager.ts";
import {PlayerManager} from "../../app/PlayerManager.ts";
import {XRManager} from "../../xr/XRManager.ts";
import {XRControllerManager} from "../../xr/XRControllerManager.ts";
import { RandomUtils } from "../../node3d/tools/utils/RandomUtils.ts";


export class DragBoundingBox implements B.Behavior<B.AbstractMesh> {
    name = "DragBoundingBox"
    selected: B.AbstractMesh | null = null
    drag: B.PointerDragBehavior

    private readonly id = RandomUtils.randomID()

    private initialPosition: B.Vector3 | null = null
    private observerHandle: B.Nullable<B.Observer<B.Scene>> = null

    private readonly HORIZONTAL_SPEED = 0.10
    private readonly MAX_DISTANCE = 15
    private readonly MIN_HEIGHT = 0.1

    public on_move = ()=>{}
    public on_select = ()=>{}
    public on_unselect = ()=>{}

    constructor() {
        this.drag = new B.PointerDragBehavior({ dragPlaneNormal: new B.Vector3(0, 1, 0) })

        this.drag.useObjectOrientationForDragging = false;
        this.drag.onDragObservable.add(() => {
            if (this.selected) {
                this._applyConstraints()
                this.on_move()
            }
        });
    }

    init(): void {
        console.log("DragBoundingBox initialized");
    }

    attach(target: B.AbstractMesh): void {
        console.log("DragBoundingBox attached to", target.name);

        target.actionManager ??= new B.ActionManager(target._scene)

        // Select on pick up
        target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickDownTrigger, () => this.select(target)))
        
        // Unselect on pick down or pick out
        target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, () => this.release()))
        target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, () => this.release()))
    }

    detach(): void {
        this.release()
    }

    /**
     * Select a mesh as draggable target, if another mesh is already selected, its unselected
     */
    select(target: B.AbstractMesh | null): void {
        // Do nothing is the target is the same as before
        if (this.selected === target) return

        // Release the previously selected target
        this.release()

        this.selected = target

        if (this.selected) {
            try { XRManager.getInstance().xrFeaturesManager.disableFeature(B.WebXRFeatureName.MOVEMENT) }
            catch (e) { console.warn("Could not disable XR movement:", e) }

            this.selected.visibility = 0.5;
            this.selected.addBehavior(this.drag);
            const player = PlayerManager.getInstance().getPlayerState();

            if (player && player.direction) {
                const norm = new B.Vector3(player.direction.x, player.direction.y, player.direction.z)
                this.drag.options.dragPlaneNormal = norm
            }
            this.initialPosition = this.selected.position.clone()
            this._setupInputListeners()

            this.on_select()
        }
    }

    /**
     * Unselect the currently selected mesh
     */
    release() {
        if (!this.selected) return;

        console.log(`DragBoundingBox: Releasing ${this.selected.name}`);
        try {
            XRManager.getInstance().xrFeaturesManager.enableFeature(
                B.WebXRFeatureName.MOVEMENT,
                "latest",
                {
                    xrInput: XRManager.getInstance().xrHelper.input,
                    movementSpeed: 0.2,
                    rotationSpeed: 0.3
                }
            );
        } catch (e) {
            console.warn("Could not re-enable XR movement:", e);
        }

        this.selected.visibility = 0;
        if (this.selected.behaviors && this.selected.behaviors.includes(this.drag)) {
            this.selected.removeBehavior(this.drag);
        }

        this._removeListeners()

        // Forbid putting the object under the minimum height
        if(this.selected.position.y < this.MIN_HEIGHT){
            this.selected.position.y = this.MIN_HEIGHT
            this.on_move()
        }

        this.initialPosition = null
        this.selected = null

        this.on_unselect()
    }


    private _setupInputListeners(): void {
        this._removeListeners();

        XRControllerManager.Instance.addButtonListener('left', 'x-button', `${this.id}-reset`, (event) => {
            if (this.selected && event.pressed && this.initialPosition) {
                // Réinitialiser à la position initiale
                this.selected.position = this.initialPosition.clone();
                console.log("DragBoundingBox: Reset to initial position");
                if (!this.selected) this.on_move()
            }
        })

        this._setupDirectControllerTracking();
    }

    private _setupDirectControllerTracking(): void {
        if (this.observerHandle) {
            SceneManager.getInstance().getScene().onBeforeRenderObservable.remove(this.observerHandle);
            this.observerHandle = null;
        }

        this.observerHandle = SceneManager.getInstance().getScene().onBeforeRenderObservable.add(() => {
            if (!this.selected) return;

            const controller = XRManager.getInstance().xrInputManager.rightController;
            if (!controller || !controller.motionController) return;

            const thumbstick = controller.motionController.getComponent("xr-standard-thumbstick");
            if (!thumbstick) return

            const x = thumbstick.axes.x
            const y = thumbstick.axes.y

            if (Math.abs(x) >= 0.2 || Math.abs(y) >= 0.2) {
                if (this.selected.behaviors && this.selected.behaviors.includes(this.drag)) {
                    this.selected.removeBehavior(this.drag);
                }
            }
            else return

            const playerState = PlayerManager.getInstance().getPlayerState()
            if (!playerState || !playerState.direction) return

            const forward = new B.Vector3(
                playerState.direction.x,
                0,
                playerState.direction.z
            ).normalize();

            const right = new B.Vector3(forward.z, 0, -forward.x).normalize()
            const forwardMove = forward.scale(-y * this.HORIZONTAL_SPEED)
            const rightMove = right.scale(x * this.HORIZONTAL_SPEED)

            this.selected.position.addInPlace(forwardMove)
            this.selected.position.addInPlace(rightMove)

            this._applyConstraints()
            if (this.selected) this.on_move()
        });
    }

    private _removeListeners(): void {
        try {
            XRControllerManager.Instance.removeButtonListener( 'left', 'x-button', `${this.id}-reset`)
        } catch (e) {
            console.warn("Error removing button listeners:", e);
        }

        if (this.observerHandle) {
            SceneManager.getInstance().getScene().onBeforeRenderObservable.remove(this.observerHandle);
            this.observerHandle = null;
        }
    }

    private _applyConstraints(): void {
        if (!this.selected) return;

        const playerState = PlayerManager.getInstance().getPlayerState();
        if (!playerState || !playerState.position) return;

        const playerPos = new B.Vector3(
            playerState.position.x,
            playerState.position.y,
            playerState.position.z
        );

        // 1. Vérifier la distance par rapport au joueur
        const distance = B.Vector3.Distance(this.selected.position, playerPos);

        if (distance > this.MAX_DISTANCE) {
            // Repositionner à la distance maximale
            const dir = this.selected.position.subtract(playerPos).normalize();
            this.selected.position = playerPos.add(dir.scale(this.MAX_DISTANCE));
        }

        // 2. Vérifier la hauteur minimale
        if (this.selected.position.y < this.MIN_HEIGHT) {
            this.selected.position.y = this.MIN_HEIGHT;
        }
    }

}