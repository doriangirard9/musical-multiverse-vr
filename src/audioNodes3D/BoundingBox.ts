import * as B from "@babylonjs/core";
import {DragBoundingBox} from "./DragBoundingBox";
import {App} from "../App";
import {AudioNode3D} from "./AudioNode3D";
import {XRInputStates} from "../xr/types";
import {RotateBoundingBox} from "./RotateBoundingBox.ts";
import {ControllerBehaviorManager} from "../xr/BehaviorControllerManager.ts";

export class BoundingBox {

    public boundingBox!: B.AbstractMesh;
    public dragBehavior!: DragBoundingBox;
    public rotationBehavior!: RotateBoundingBox;
    private _app: App;
    private id: string;
    private highlightLayer!: B.HighlightLayer;

    constructor(private audioNode3D: AudioNode3D, private scene: B.Scene, id: string, app: App) {
        this._app = app;
        this.id = id;
        this.dragBehavior = new DragBoundingBox(this._app);
        this.rotationBehavior = new RotateBoundingBox(this._app);
        this.createBoundingBox();
        console.log("BoundingBox created");
        this.boundingBox.rotation.x = -Math.PI / 6;
        // another methode for dragin behavior
        // // Add SixDofDragBehavior
        // const dragBehavior = new B.SixDofDragBehavior();
        // this.boundingBox.addBehavior(dragBehavior);

        // // Limit movement to x and z axes by adjusting position on drag
        // dragBehavior.onDragObservable.add((event) => {
        //     this.boundingBox.position.y = 0; // Keeps the box at y = 0 to restrict it to the XZ plane
        // });

    }

    // Create the bounding box and set its properties
    public createBoundingBox(): void {
        let w = this.audioNode3D.baseMesh.getBoundingInfo().boundingBox.extendSize.x * 2;
        let h = this.audioNode3D.baseMesh.getBoundingInfo().boundingBox.extendSize.y * 2;
        let d = this.audioNode3D.baseMesh.getBoundingInfo().boundingBox.extendSize.z * 2;

        // Create the bounding box

        // New sizes for the bounding box
        //const bbWidth = w;
        const bbHeight = h + 0.1;
        const bbDepth = d + 0.8;

        this.boundingBox = B.MeshBuilder.CreateBox(`boundingBox${this.id}`, {
            width: w,
            height: bbHeight,
            depth: bbDepth
        }, this.scene);
        this.boundingBox.isVisible = true;
        this.boundingBox.visibility = 0;  // Adjust visibility if needed
        // make the boundingbox  clickable
        this.boundingBox.isPickable = true;
        this.boundingBox.checkCollisions = true;
        this.audioNode3D.baseMesh.parent = this.boundingBox;

        if (this.audioNode3D.inputMesh) this.audioNode3D.inputMesh.parent = this.boundingBox;
        if (this.audioNode3D.outputMesh) this.audioNode3D.outputMesh.parent = this.boundingBox;

        // Initialize the ActionManager only once here
        // this.boundingBox.actionManager = new B.ActionManager(this.scene);

        // Set up drag behavior
        this.setupDragBehavior();
        //this._enableRotationBehavior();
        // Register all action handlers (pointer over, pointer out, right-click, etc.)
        this.addActionHandlers();
        this.attachControllerBehaviors()
        // Update any arcs related to this bounding box
        this.updateArcs();
        // setTimeout(() => {}, 1000);
        this.positionBoundingBoxInFrontOfPlayer();

        this.boundingBox.getChildMeshes().forEach((mesh) => {
            this._app.shadowGenerator.addShadowCaster(mesh)
        })

        ControllerBehaviorManager.addBoundingBox(this);


    }

    public attachControllerBehaviors(): void {
        console.log("Attaching controller behaviors in BoundingBox");

        const xrLeftInputStates: XRInputStates = this._app.xrManager.xrInputManager.leftInputStates;
        xrLeftInputStates['x-button'].onButtonStateChangedObservable.add(this._leftXButtonHandler);

        const xrRightInputStates: XRInputStates = this._app.xrManager.xrInputManager.rightInputStates;
        xrRightInputStates['b-button'].onButtonStateChangedObservable.add(this._rightBButtonHandler);

        xrRightInputStates['xr-standard-squeeze'].onButtonStateChangedObservable.add(this._rightSqueezeHandler);
    }

    // Add action handlers for the bounding box (pointer events, right-clicks, etc.)
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
        // MB : apparently this listener is the reason for the PickedTyInfo nasty bug
        // Pointer over action (highlight the bounding box)
        /*
        try {
            console.log("add action to boundingbox", this.boundingBox.actionManager)

            this.boundingBox.actionManager!.registerAction(
                new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
                    try {
                        // MICHEL BUFFA
                        // C'EST CA QUI FAISAIT LE RAYPICK INFO ERROR AU DEMARRAGE
                        //this.highlightLayer.addMesh(this.boundingBox as B.Mesh, B.Color3.Black());
                    } catch (error) {
                        console.error("Failed to highlight bounding box:", error);
                    }
                })
            );
            console.log("add action Manager to boundingbox");

        } catch (error) {
            console.error("Failed to register pointer over action:", error);
        }
            */
        // END OF BUGGY PART


        //     try {
        //         console.log("add action to boundingbox",this.boundingBox.actionManager)
        //     this.boundingBox.actionManager!.registerAction(
        //         new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
        //             this.highlightLayer.addMesh(this.boundingBox as B.Mesh, B.Color3.Black());
        //         })
        //     );
        // } catch (error) {
        //     console.error("Failed to register pointer over action:", error);
        // }

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
        //on click right click on the mouse the menu will appear
        // this.boundingBox.actionManager!.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnRightPickTrigger, (): void => {

        //     if (this.audioNode3D._isMenuOpen) this.audioNode3D._hideMenu();
        //     else this.audioNode3D._showMenu();
        //     }));

        // this.boundingBox.actionManager = new B.ActionManager(this.scene);

        const xrRightInputStates: XRInputStates = this._app.xrManager.xrInputManager.rightInputStates;

        this.boundingBox.actionManager!.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
            console.log("pointer over", xrRightInputStates);
            // highlightLayer.addMesh(this.baseMesh, B.Color3.Black());
            xrRightInputStates['b-button'].onButtonStateChangedObservable.add((component: B.WebXRControllerComponent): void => {
                if (component.pressed) {
                    if (this.audioNode3D._isMenuOpen) this.audioNode3D._hideMenu();
                    else this.audioNode3D._showMenu();
                }
            });

        }));

        // this.boundingBox.actionManager!.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
        //     // highlightLayer.removeMesh(this.baseMesh);
        //     xrLeftInputStates['x-button'].onButtonStateChangedObservable.clear();
        // }));
    }

    private _leftXButtonHandler = (component: B.WebXRControllerComponent): void => {
        if (component.pressed) {
            this._handleDelete();
        }
    }

    private _rightBButtonHandler = (component: B.WebXRControllerComponent): void => {
        if (component.pressed) {
            this._handleDelete()
        }
    };

    private _rightSqueezeHandler = (component: B.WebXRControllerComponent): void => {
        if (component.value < 1){
            this._disableRotationBehavior();

        }

        if (component.value === 1) {
            this._enableRotationBehavior();
        }

    }

    private positionBoundingBoxInFrontOfPlayer(): void {
        // Check if player state is valid before proceeding
        this._app.menu.hide();
        const data = this._app._getPlayerState();
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
        //this.boundingBox.rotation.x = -Math.PI / 6;  // Optional rotation on X-axis

        // Additional scene-related setups
        this._app.ground.checkCollisions = true;

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
        let controller = this._app.xrManager.xrInputManager.rightController;
        if (!controller) return;
        const ray = new B.Ray(controller.pointer.position, controller.pointer.forward, 100);
        const pickResult = this._app.scene.pickWithRay(ray);

        if (pickResult && pickResult.pickedMesh && pickResult.pickedMesh === this.boundingBox) {
            this.audioNode3D._showMenu();
        }
    }
    // Update the arcs that connect the bounding box to other objects
    private updateArcs(): void {
        if (this.boundingBox) {
            this.boundingBox.onAfterWorldMatrixUpdateObservable.add((): void => {
                // Update incoming arcs
                this.audioNode3D.inputArcs.forEach(a => {
                    if (a.TubeMesh && a.OutputMesh && a.inputMesh) {
                        let start = a.OutputMesh.getAbsolutePosition();
                        let end = a.inputMesh.getAbsolutePosition();
                        let direction = end.subtract(start).normalize();
                        var arrowLength = 0.7; // Length of the arrowhead
                        var sphereRadius = 0.25; // Radius of the sphere
                        var adjustedEnd = end.subtract(direction.scale(sphereRadius + arrowLength / 2));

                        let options = {path: [start, adjustedEnd], radius: 0.1, tessellation: 8, instance: a.TubeMesh};
                        B.MeshBuilder.CreateTube("tube", options, this.scene);

                        // Update arrow
                        a.arrow.position = adjustedEnd;
                        a.arrow.lookAt(end);
                        a.arrow.rotate(B.Axis.X, Math.PI / 2, B.Space.LOCAL);
                        this._app.shadowGenerator.addShadowCaster(a.TubeMesh);
                        this._app.shadowGenerator.addShadowCaster(a.arrow);
                    }
                });

                // Update outgoing arcs
                this.audioNode3D.outputArcs.forEach(a => {
                    if (a.TubeMesh && a.OutputMesh && a.inputMesh) {
                        let start = a.OutputMesh.getAbsolutePosition();
                        let end = a.inputMesh.getAbsolutePosition();
                        let direction = end.subtract(start).normalize();
                        var arrowLength = 0.7; // Length of the arrowhead
                        var sphereRadius = 0.25; // Radius of the sphere
                        var adjustedEnd = end.subtract(direction.scale(sphereRadius + arrowLength / 2));

                        let options = {path: [start, adjustedEnd], radius: 0.1, tessellation: 8, instance: a.TubeMesh};
                        B.MeshBuilder.CreateTube("tube", options, this.scene);

                        // Update arrow
                        a.arrow.position = adjustedEnd;
                        a.arrow.lookAt(end);
                        a.arrow.rotate(B.Axis.X, Math.PI / 2, B.Space.LOCAL);
                    }
                });
            })
        }
    }


}
