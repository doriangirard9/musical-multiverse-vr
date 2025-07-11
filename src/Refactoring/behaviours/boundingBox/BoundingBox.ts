import * as B from "@babylonjs/core";

import {Scene} from "@babylonjs/core";
import {SceneManager} from "../../app/SceneManager.ts";
import {PlayerManager} from "../../app/PlayerManager.ts";
import { HoldableBehaviour } from "./HoldableBehaviour.ts";



export class BoundingBox {
    private scene : Scene = SceneManager.getInstance().getScene();
    readonly holdable: HoldableBehaviour
    public boundingBox!: B.AbstractMesh;

    public on_move = ()=>{}

    constructor(private draggable: B.AbstractMesh) {

        // Create the bounding box
        let w = this.draggable.getBoundingInfo().boundingBox.extendSize.x * 2
        let h = this.draggable.getBoundingInfo().boundingBox.extendSize.y * 2
        let d = this.draggable.getBoundingInfo().boundingBox.extendSize.z * 2

        const boundingBox = this.boundingBox = B.MeshBuilder.CreateBox(`boundingBox`, {width:w+.01, height:h+.01, depth:d+.5}, this.scene)
        this.draggable.parent = this.boundingBox

        this.boundingBox.isVisible = true
        this.boundingBox.visibility = 0
        this.boundingBox.isPickable = true
        this.boundingBox.checkCollisions = false
        this.positionBoundingBoxInFrontOfPlayer()

        this.boundingBox.rotation.x = -Math.PI / 6

        // Holdable behaviour
        this.holdable = new HoldableBehaviour()
        this.holdable.onMoveObservable.add(()=>this.on_move())
        this.holdable.onRotateObservable.add(()=>this.on_move())
        this.boundingBox.addBehavior(this.holdable)

        // Bounding box visibility
        let hover = false
        let took = false

        function updateVisibility() {
            if(took) boundingBox.visibility = .5
            else if(hover) boundingBox.visibility = .2
            else boundingBox.visibility = 0
        }

        const action = this.boundingBox.actionManager ??= new B.ActionManager(this.scene)
        action.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, ()=>{
            hover = true
            updateVisibility()
        }))
        action.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, ()=>{
            hover = false
            updateVisibility()
        }))
        this.holdable.onGrabObservable.add(() => {
            took = true
            updateVisibility()
        })
        this.holdable.onReleaseObservable.add(() => {
            took = false
            updateVisibility()
        })
        
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

    }


    public dispose(): void {
        this.boundingBox?.dispose()
    }

}
