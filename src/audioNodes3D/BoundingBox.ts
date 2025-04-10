import * as B from "@babylonjs/core";
import {DragBoundingBox} from "./DragBoundingBox";
import {App} from "../App";
import {AudioNode3D} from "./AudioNode3D";
import {XRInputStates} from "../xr/types";
import {RotateBoundingBox} from "./RotateBoundingBox.ts";
import {XRControllerManager} from "../xr/XRControllerManager.ts";
import {AudioEventBus} from "../AudioEvents.ts";

export class BoundingBox {

    public boundingBox!: B.AbstractMesh;
    public dragBehavior!: DragBoundingBox;
    public rotationBehavior!: RotateBoundingBox;
    private _app: App;
    private id: string;
    private highlightLayer!: B.HighlightLayer;
    private readonly eventBus = AudioEventBus.getInstance();

    private readonly xButtonListenerId: string;
    private readonly bButtonListenerId: string;
    private readonly squeezeListenerId: string;

    constructor(private audioNode3D: AudioNode3D, private scene: B.Scene, id: string, app: App) {
        this._app = app;
        this.id = id;
        this.dragBehavior = new DragBoundingBox(this._app);
        this.rotationBehavior = new RotateBoundingBox(this._app);

        this.xButtonListenerId = `x-button-${this.id}`;
        this.bButtonListenerId = `b-button-${this.id}`;
        this.squeezeListenerId = `squeeze-${this.id}`;

        this.createBoundingBox();
        this.initializeEventListeners();

        this.boundingBox.rotation.x = -Math.PI / 6;

        this.attachControllerBehaviors();

    }

    private initializeEventListeners(): void {
        // Écouter les changements de position
        this.eventBus.on('POSITION_CHANGE', (payload) => {
            if (payload.nodeId === this.id) {
                this.updateAllArcs();
            }
        });

        // Écouter les connexions/déconnexions
        this.eventBus.on('CONNECT_NODES', () => this.updateAllArcs());
        this.eventBus.on('DISCONNECT_NODES', () => this.updateAllArcs());
    }

    private updateAllArcs(): void {
        this.updateAudioArcs();
        this.updateMidiArcs();
    }

    private updateAudioArcs(): void {
        // Mettre à jour les arcs d'entrée audio
        this.audioNode3D.inputArcs.forEach(arc => {
            if (arc.TubeMesh && arc.OutputMesh && arc.inputMesh) {
                this.updateArc(
                    arc.OutputMesh.getAbsolutePosition(),
                    arc.inputMesh.getAbsolutePosition(),
                    arc.TubeMesh,
                    arc.arrow
                );
            }
        });

        // Mettre à jour les arcs de sortie audio
        this.audioNode3D.outputArcs.forEach(arc => {
            if (arc.TubeMesh && arc.OutputMesh && arc.inputMesh) {
                this.updateArc(
                    arc.OutputMesh.getAbsolutePosition(),
                    arc.inputMesh.getAbsolutePosition(),
                    arc.TubeMesh,
                    arc.arrow
                );
            }
        });
    }

    private updateMidiArcs(): void {
        // Mettre à jour les arcs d'entrée MIDI
        this.audioNode3D.inputArcsMidi.forEach(arc => {
            if (arc.TubeMesh && arc.OutputMeshMidi && arc.inputMeshMidi) {
                this.updateArc(
                    arc.OutputMeshMidi.getAbsolutePosition(),
                    arc.inputMeshMidi.getAbsolutePosition(),
                    arc.TubeMesh,
                    arc.arrow
                );
            }
        });

        // Mettre à jour les arcs de sortie MIDI
        this.audioNode3D.outputArcsMidi.forEach(arc => {
            if (arc.TubeMesh && arc.OutputMeshMidi && arc.inputMeshMidi) {
                this.updateArc(
                    arc.OutputMeshMidi.getAbsolutePosition(),
                    arc.inputMeshMidi.getAbsolutePosition(),
                    arc.TubeMesh,
                    arc.arrow
                );
            }
        });
    }

    private updateArc(
        start: B.Vector3,
        end: B.Vector3,
        tubeMesh: B.Mesh,
        arrow: B.Mesh
    ): void {
        const direction = end.subtract(start).normalize();
        const arrowLength = 0.7;
        const sphereRadius = 0.25;
        const adjustedEnd = end.subtract(direction.scale(sphereRadius + arrowLength / 2));

        // Mettre à jour le tube
        const options = {
            path: [start, adjustedEnd],
            radius: 0.1,
            tessellation: 8,
            instance: tubeMesh
        };
        B.MeshBuilder.CreateTube("tube", options, this.scene);

        // Mettre à jour la flèche
        arrow.position = adjustedEnd;
        arrow.lookAt(end);
        arrow.rotate(B.Axis.X, Math.PI / 2, B.Space.LOCAL);

        // Ajouter les ombres
        this._app.shadowGenerator.addShadowCaster(tubeMesh);
        this._app.shadowGenerator.addShadowCaster(arrow);
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

        this.setupBoundingBoxProperties();
        this.setupMeshHierarchy();
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

    private setupMeshHierarchy(): void {
        this.audioNode3D.baseMesh.parent = this.boundingBox;
        if (this.audioNode3D.inputMesh) {
            this.audioNode3D.inputMesh.parent = this.boundingBox;
        }
        if (this.audioNode3D.outputMesh) {
            this.audioNode3D.outputMesh.parent = this.boundingBox;
        }
    }

    private setupBehaviors(): void {
        this.setupDragBehavior();
        this.addActionHandlers();
        this.attachControllerBehaviors();
    }

    private setupShadows(): void {
        this.boundingBox.getChildMeshes().forEach((mesh) => {
            this._app.shadowGenerator.addShadowCaster(mesh);
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

        XRControllerManager.Instance.setScene(this._app.scene);

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


    private positionBoundingBoxInFrontOfPlayer(): void {
        // Check if player state is valid before proceeding
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
