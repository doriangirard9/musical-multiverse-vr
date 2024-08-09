import * as B from "@babylonjs/core";
import { DragBoundingBox } from "./DragBoundingBox";
import { App } from "../App";
import { AudioNode3D } from "./AudioNode3D";

export class BoundingBox {
    
    public boundingBox!: B.AbstractMesh;
    // protected readonly _app: App = App.getInstance();
    public dragBehavior! : DragBoundingBox;
    _app: App;
    id:string;
    constructor(private audioNode3D: AudioNode3D, private scene: B.Scene, id: string, app: App) {
        this._app = app;
        this.id = id;
        this.createBoundingBox();
        this.dragBehavior = new DragBoundingBox(this._app)

        // // Add SixDofDragBehavior
        // const dragBehavior = new B.SixDofDragBehavior();
        // this.boundingBox.addBehavior(dragBehavior);

        // // Limit movement to x and z axes by adjusting position on drag
        // dragBehavior.onDragObservable.add((event) => {
        //     this.boundingBox.position.y = 0; // Keeps the box at y = 0 to restrict it to the XZ plane
        // });


    }

   // Create bounding box should be the parent of the node and the parameters and Wam3D
   public createBoundingBox(): void {
    
    let w = this.audioNode3D.baseMesh.getBoundingInfo().boundingBox.extendSize.x * 2;
    let h = this.audioNode3D.baseMesh.getBoundingInfo().boundingBox.extendSize.y * 2;
    let d = this.audioNode3D.baseMesh.getBoundingInfo().boundingBox.extendSize.z * 2;

    this.boundingBox = B.MeshBuilder.CreateBox(`boundingBox${this.id}`, { width: w, height: h*1.5, depth: d*2 }, this.scene);
     this.boundingBox.isVisible = true;
    this.boundingBox.visibility = 0; // Adjust visibility as needed
    // make the boundingbox  clickable
    this.boundingBox.isPickable = true;
    this.boundingBox.checkCollisions = true;
    this.audioNode3D.baseMesh.parent = this.boundingBox;
    if (this.audioNode3D.inputMesh) this.audioNode3D.inputMesh.parent = this.boundingBox;
    if (this.audioNode3D.outputMesh) this.audioNode3D.outputMesh.parent = this.boundingBox;
    const data = this._app._getPlayerState();
    
    const direction = new B.Vector3(data.direction.x,data.direction.y,data.direction.z)
    const position = new B.Vector3(data.position.x,data.position.y+ 0.3,data.position.z).addInPlace(direction.normalize().scale(5))

    this.boundingBox.position = position
    this.boundingBox.setDirection(direction)

    // this.boundingBox.position = new B.Vector3(data.position.x, data.position.y + 0.3, data.position.z + 3.5);
    // this.boundingBox.setDirection(new B.Vector3(data.direction.x, data.direction.y, data.direction.z).normalize());
    // rotate on x axis
    this.boundingBox.rotation.x = -Math.PI / 6;
    this._app.ground.checkCollisions = true;
this._app.menu.hide()
    this.updateArcs();

}



public addMovingBehaviourToBoundingBox(): void {
    const highlightLayer = new B.HighlightLayer(`hl${this.id}`, this.scene);
    this.boundingBox.actionManager = new B.ActionManager(this.scene);
    this.boundingBox.addBehavior(this.dragBehavior);

    this.boundingBox.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
        highlightLayer.addMesh(this.boundingBox as B.Mesh, B.Color3.Black());
    }));

    this.boundingBox.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
        highlightLayer.removeMesh(this.boundingBox as B.Mesh);
    }));

    

}

private updateArcs(): void {
    if(this.boundingBox){
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

            let options = { path: [start, adjustedEnd], radius: 0.1, tessellation: 8, instance: a.TubeMesh };
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

            let options = { path: [start, adjustedEnd], radius: 0.1, tessellation: 8, instance: a.TubeMesh };
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
