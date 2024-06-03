// import * as B from "@babylonjs/core";
// import { Wam3D } from "./Wam3D";

// export class BoundingBox {
//     private boundingBox!: B.AbstractMesh;
//     private _app: any; // Replace with the actual type if available

//     constructor(private wam3d: Wam3D, private scene: B.Scene, app: any) {
//         this._app = app;
//         this.createBoundingBox();
//         this.moveMesh();
//     }

//     public createBoundingBox(): void {
//         const size = this.wam3d._usedParameters.length;
//         this.boundingBox = B.MeshBuilder.CreateBox(`boundingBox${this.wam3d.id}`, { width: size + 2, height: 1.5, depth: 1.5 }, this.scene);
//         this.boundingBox.isVisible = true;
//         this.boundingBox.visibility = 0.5; // Adjust visibility as needed
//         this.boundingBox.showBoundingBox = true; // Optionally show the bounding box
//         this.boundingBox.isPickable = true;

//         this.wam3d.baseMesh.parent = this.boundingBox;
//         if (this.wam3d.inputMesh) this.wam3d.inputMesh.parent = this.boundingBox;
//         if (this.wam3d.outputMesh) this.wam3d.outputMesh.parent = this.boundingBox;

//         const data = this._app._sendPlayerState();
//         this.boundingBox.position = new B.Vector3(data.position.x, data.position.y + 0.3, data.position.z + 3.5);
//         this.boundingBox.rotation.x = -Math.PI / 6;
//     }

//     protected moveMesh(): void {
//         const highlightLayer = new B.HighlightLayer(`hl${this.wam3d.id}`, this.scene);
//         this.boundingBox.actionManager = new B.ActionManager(this.scene);

//         const xrLeftInputStates = this._app.xrManager.xrInputManager.leftInputStates;
//         this.boundingBox.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
//             highlightLayer.addMesh(this.boundingBox as B.Mesh, B.Color3.Black());

//             xrLeftInputStates['x-button'].onButtonStateChangedObservable.add((component: B.WebXRControllerComponent): void => {
//                 if (component.pressed) {
//                     if (this.wam3d.isMenuOpen) this.wam3d.hideMenu();
//                     else this.wam3d.showMenu();
//                 }
//             });
//         }));
//         this.boundingBox.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
//             highlightLayer.removeMesh(this.boundingBox as B.Mesh);
//             xrLeftInputStates['x-button'].onButtonStateChangedObservable.clear();
//         }));

//         // Move the WAM in the scene
//         this.boundingBox.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
//             this.boundingBox.addBehavior(this.wam3d.pointerDragBehavior);
//         }));
//         this.boundingBox.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
//             this.boundingBox.removeBehavior(this.wam3d.pointerDragBehavior);
//         }));
//     }
// }
