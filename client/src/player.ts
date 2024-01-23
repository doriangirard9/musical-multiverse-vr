import * as B from "@babylonjs/core";
import {NetworkPlayer} from "./models";

export default class Player {
    head: B.Mesh;
    body: B.Mesh;
    leftHand: B.Mesh;
    rightHand: B.Mesh;
    color: B.Color3 = B.Color3.Random();

    constructor(public id: string, private scene: B.Scene){
        this.createMesh();
    }

    createMesh(): void {
        this.createHead();
        this.createBody();
        this.createHands();
    }

    createHead(): void {
        // create head
        this.head = B.MeshBuilder.CreateSphere(`${this.id}Head`, { diameter: 0.7 }, this.scene);
        this.head.position = new B.Vector3(0, 1.7, 0);
        const playerHeadMaterial = new B.StandardMaterial(`${this.id}HeadMaterial`, this.scene);
        playerHeadMaterial.diffuseColor = this.color;
        this.head.material = playerHeadMaterial;

        // create left eye
        const leftEye = B.MeshBuilder.CreateSphere(`${this.id}LeftEye`, { diameter: 0.1 }, this.scene);
        leftEye.parent = this.head;
        leftEye.position = new B.Vector3(-0.15, 0.1, 0.3);
        const leftEyeMaterial = new B.StandardMaterial(`${this.id}LeftEyeMaterial`, this.scene);
        leftEyeMaterial.diffuseColor = B.Color3.Black();
        leftEye.material = leftEyeMaterial;

        // create right eye
        const rightEye = B.MeshBuilder.CreateSphere(`${this.id}RightEye`, { diameter: 0.1 }, this.scene);
        rightEye.parent = this.head;
        rightEye.position = new B.Vector3(0.15, 0.1, 0.3);
        const rightEyeMaterial = new B.StandardMaterial(`${this.id}RightEyeMaterial`, this.scene);
        rightEyeMaterial.diffuseColor = B.Color3.Black();
        rightEye.material = rightEyeMaterial;
    }

    createBody(): void {
        this.body = B.MeshBuilder.CreateCapsule(`${this.id}Body`, { radius: 0.4, height: 1.4 }, this.scene);
        this.body.position = new B.Vector3(0, 0, 0);
        const playerBodyMaterial = new B.StandardMaterial(`${this.id}BodyMaterial`, this.scene);
        playerBodyMaterial.diffuseColor = this.color;
        this.body.material = playerBodyMaterial;
    }

    createHands(): void {
        // create left hand
        this.leftHand = B.MeshBuilder.CreateSphere(`${this.id}LeftHand`, { diameter: 0.2 }, this.scene);
        this.leftHand.position = new B.Vector3(-1, 1, 0);
        const playerLeftHandMaterial = new B.StandardMaterial(`${this.id}LeftHandMaterial`, this.scene);
        playerLeftHandMaterial.diffuseColor = this.color;
        this.leftHand.material = playerLeftHandMaterial;

        // create right hand
        this.rightHand = B.MeshBuilder.CreateSphere(`${this.id}RightHand`, { diameter: 0.2 }, this.scene);
        this.rightHand.position = new B.Vector3(1, 1, 0);
        const playerRightHandMaterial = new B.StandardMaterial(`${this.id}RightHandMaterial`, this.scene);
        playerRightHandMaterial.diffuseColor = this.color;
        this.rightHand.material = playerRightHandMaterial;
    }

    update(data: NetworkPlayer): void {
        this.head.position = new B.Vector3(data.position.x, data.position.y, data.position.z);
        this.body.position = new B.Vector3(data.position.x, data.position.y - 1, data.position.z);
        this.head.lookAt(
            new B.Vector3(
                this.head.position.x + data.direction.x,
                this.head.position.y + data.direction.y,
                this.head.position.z + data.direction.z
            )
        );
        this.leftHand.position = new B.Vector3(data.leftHandPosition.x, data.leftHandPosition.y, data.leftHandPosition.z);
        this.rightHand.position = new B.Vector3(data.rightHandPosition.x, data.rightHandPosition.y, data.rightHandPosition.z);
    }
}
