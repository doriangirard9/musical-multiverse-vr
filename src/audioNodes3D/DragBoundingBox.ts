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
                    const norm = new B.Vector3(data?.direction.x, 0, data?.direction.z);
                    this.updateDragBehavior(norm, axis.y);
                }
            });
        });
    }

    attach(target: B.AbstractMesh): void {
        console.log("Behavior attached");
        target.actionManager = new B.ActionManager(target._scene);
        target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickDownTrigger, () => {
            console.log("drag behavior: picked down");
            this.select(target);
        }));
        target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, () => {
            console.log("drag behavior: picked up");
            this.onRelease(/*target*/);
        }));
        target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (e) => {
            //console.log(e.meshUnderPointer?.position)
            //console.log(target.position)
            console.log("drag behavior: picked out");
            if (e.meshUnderPointer && e.meshUnderPointer.position.y < 0) {
                target.position.y = 1;
            }
            this.onRelease(/*target*/);
        }));

        // Test MB
        /*
        target.actionManager.registerAction(
            new B.ExecuteCodeAction(
              {
                trigger: B.ActionManager.OnIntersectionEnterTrigger,
                parameter: {
                  mesh: this.app.ground,
                  usePreciseIntersection: true,
                },
              },
              function() {
                console.log("intersected" + target.name);
                target.position.y = 1;
              }
            ),
          );
          */
    }

    detach(): void {
        console.log("Behavior detached");
        if (this.selected) {
            this.select(null);
        }
        // target.actionManager.clear();
    }
    select(target: B.AbstractMesh | null) {
        console.log("Behavior selected");

        if (!this.selected) this.app.xrManager.xrFeaturesManager.disableFeature(B.WebXRFeatureName.MOVEMENT);
        this.selected = target;
        if (this.selected != null) {
            this.selected.visibility = 0.5;
            this.selected.addBehavior(this.drag);
            const data = this.app._getPlayerState();
            console.log(data)
            let norm = new B.Vector3(data?.direction.x, data?.direction.y, data?.direction.z);
            this.drag.options.dragPlaneNormal = norm;
            // MB : fix for having the proper plane orientation, we should not take
            // into account the object orientation. Cf https://doc.babylonjs.com/features/featuresDeepDive/behaviors/meshBehaviors
            this.drag.useObjectOrientationForDragging = false;
        }

    }

    onRelease(/*target: B.AbstractMesh*/): void {
        console.log("Behavior released");
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
        console.log("Behavior updated");
        if (this.selected) {
            this.selected.removeBehavior(this.drag);
            this.selected.position.addInPlace(norm.scaleInPlace(scale * -0.3));
            this.selected.addBehavior(this.drag);
        }
    }
}
