import * as B from "@babylonjs/core";
import { App } from "../App";

export class DragBoundingBox implements B.Behavior<B.AbstractMesh> {
    name = "DragBoundingBox";
    selected: B.AbstractMesh | null = null;
    drag: B.PointerDragBehavior;

    constructor(private app: App) {
        // Initialize drag behavior with a default normal
        this.drag = new B.PointerDragBehavior({ dragPlaneNormal: new B.Vector3(0, 0, 1) });
    }

    init(): void {
        // Add controller listeners if applicable, for example in XR environments
        this.app.xrManager.xrHelper.input.controllers.forEach(controller => {
            const thumbstick = controller.motionController?.getComponent("xr-standard-thumbstick");
            thumbstick?.onAxisValueChangedObservable.add((axis) => {
                if (this.selected) {
                    // Update drag normal dynamically based on player state
                    const data = this.app._getPlayerState();
                    const norm = new B.Vector3(data.direction.x, 0, data.direction.z);
                    this.updateDragBehavior(norm, axis.y);
                }
            });
        });
    }

    attach(target: B.AbstractMesh): void {
        target.actionManager = new B.ActionManager(target._scene);
        target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickDownTrigger, () => {
            this.select(target);
        }));
        target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, () => {
            this.onRelease(/*target*/);
        }));
        target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (e) => {
            if(e.meshUnderPointer && e.meshUnderPointer.position.y<0) e.meshUnderPointer.position.y = -1
            this.onRelease(/*target*/);
        }));
    }

    detach(): void {
        if (this.selected) {
            this.select(null);
        }
        // target.actionManager.clear();
    }
    select(target: B.AbstractMesh | null) {
        console.log("selected");
        if (!this.selected) this.app.xrManager.xrFeaturesManager.disableFeature(B.WebXRFeatureName.MOVEMENT);
        this.selected = target;
        if (this.selected != null) {
            this.selected.visibility = 0.5;
            this.selected.addBehavior(this.drag);
                const data = this.app._getPlayerState();
                const norm = new B.Vector3(data.direction.x, 0, data.direction.z);
                this.drag.options.dragPlaneNormal = norm;
        }
    }



    onRelease(/*target: B.AbstractMesh*/): void {
        if (this.selected) {
            this.app.xrManager.xrFeaturesManager.enableFeature(B.WebXRFeatureName.MOVEMENT, "latest", {
                xrInput: this.app.xrManager.xrHelper.input,
                movementSpeed: 0.2,
                rotationSpeed: 0.3,
            });
            this.selected.visibility = 0;
            this.selected.removeBehavior(this.drag);
            this.selected = null;
        }
    }

    private updateDragBehavior(norm: B.Vector3, scale: number): void {
        if (this.selected) {
            this.selected.removeBehavior(this.drag);
            this.selected.position.addInPlace(norm.scaleInPlace(scale * -0.3));
            this.selected.addBehavior(this.drag);
        }
    }
}
