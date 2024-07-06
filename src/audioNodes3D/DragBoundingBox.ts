
import * as B from "@babylonjs/core";
import { App } from "../App.ts";


export class DragBoundingBox implements B.Behavior<B.AbstractMesh> {
    
    name = "test";
    interval: number | null = null;
    selected: B.AbstractMesh | null = null;
    drag: B.PointerDragBehavior;

    constructor(private app: App) {
        this.drag = new B.PointerDragBehavior({ dragPlaneNormal: new B.Vector3(0, 0, 1) });
    }

    select(target: B.AbstractMesh | null) {
        console.log("selected");
        if (!this.selected) this.app.xrManager.xrFeaturesManager.disableFeature(B.WebXRFeatureName.MOVEMENT);
        this.selected = target;
        if (this.selected != null) {
            this.selected.visibility = 0.5;
            this.selected.addBehavior(this.drag);
        }

        const data = this.app._getPlayerState();
        const norm = new B.Vector3(data.direction.x, 0, data.direction.z);
        this.drag.options.dragPlaneNormal = norm;
    }

    init(): void {
        this.app.xrManager.xrHelper.input.controllers.forEach(controller => {
            const thumbstick = controller.motionController?.getComponent("xr-standard-thumbstick");
            thumbstick?.onAxisValueChangedObservable.add((axis) => {
                if(this.selected){
                    const data = this.app._getPlayerState();
                    const norm = new B.Vector3(data.direction.x,data.direction.y,data.direction.z)            
                    this.selected.removeBehavior(this.drag);
                    this.selected.position.addInPlace(norm.scaleInPlace(axis.y*-0.3));
                    // this.drag.attach(this.selected!);
                    this.selected.addBehavior(this.drag);
                }
            });
        });
    }

    attach(target: B.AbstractMesh): void {
        target?.actionManager?.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickDownTrigger, () => {
             this.select(target);
        }));

        const on_up = () => {
            if (this.selected) this.app.xrManager.xrFeaturesManager.enableFeature(B.WebXRFeatureName.MOVEMENT, "latest", {
                xrInput: this.app.xrManager.xrHelper.input,
                movementSpeed: 0.2,
                rotationSpeed: 0.3,
            });
            this.selected?.removeBehavior(this.drag);
            this.selected = null;
            target.visibility = 0;
        };

        target?.actionManager?.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, on_up));
        target?.actionManager?.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, on_up));
    }

    detach(): void {
        console.log("detach");
    this.select(null);
    }
}