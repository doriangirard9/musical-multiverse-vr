import * as B from "@babylonjs/core";
import {PlayerState} from "../network/types.ts";
import {SceneManager} from "./SceneManager.ts";

export class Player {
    private readonly _scene: B.Scene;
    public id: string;
    private _head!: B.Mesh;
    private _body!: B.Mesh;
    private _leftHand!: B.Mesh;
    private _rightHand!: B.Mesh;
    private _color: B.Color3 = B.Color3.Random();

    private _targetState: PlayerState | null = null;
    private readonly INTERPOLATION_SPEED = 10;

    constructor(id: string) {
        this._scene = SceneManager.getInstance().getScene()
        this.id = id;
        this._createHead();
        this._createBody();
        this._createHands();
    }

    public dispose(): void {
        this._head.dispose();
        this._body.dispose();
        this._leftHand.dispose();
        this._rightHand.dispose();
    }

    private _createHead(): void {
        // create head
        this._head = B.MeshBuilder.CreateSphere(`${this.id}Head`, { diameter: 0.7 }, this._scene);
        this._head.position = new B.Vector3(0, 1.7, 0);
        const playerHeadMaterial = new B.StandardMaterial(`${this.id}HeadMaterial`, this._scene);
        playerHeadMaterial.diffuseColor = this._color;
        this._head.material = playerHeadMaterial;

        // create left eye
        const leftEye = B.MeshBuilder.CreateSphere(`${this.id}LeftEye`, { diameter: 0.1 }, this._scene);
        leftEye.parent = this._head;
        leftEye.position = new B.Vector3(-0.15, 0.1, 0.3);
        const leftEyeMaterial = new B.StandardMaterial(`${this.id}LeftEyeMaterial`, this._scene);
        leftEyeMaterial.diffuseColor = B.Color3.Black();
        leftEye.material = leftEyeMaterial;

        // create right eye
        const rightEye = B.MeshBuilder.CreateSphere(`${this.id}RightEye`, { diameter: 0.1 }, this._scene);
        rightEye.parent = this._head;
        rightEye.position = new B.Vector3(0.15, 0.1, 0.3);
        const rightEyeMaterial = new B.StandardMaterial(`${this.id}RightEyeMaterial`, this._scene);
        rightEyeMaterial.diffuseColor = B.Color3.Black();
        rightEye.material = rightEyeMaterial;
    }

    private _createBody(): void {
        this._body = B.MeshBuilder.CreateCapsule(`${this.id}Body`, { radius: 0.4, height: 1.4 }, this._scene);
        this._body.position = new B.Vector3(0, 0, 0);
        const playerBodyMaterial = new B.StandardMaterial(`${this.id}BodyMaterial`, this._scene);
        playerBodyMaterial.diffuseColor = this._color;
        this._body.material = playerBodyMaterial;
    }

    private _createHands(): void {
        // create left hand
        this._leftHand = B.MeshBuilder.CreateSphere(`${this.id}LeftHand`, { diameter: 0.2 }, this._scene);
        this._leftHand.position = new B.Vector3(-1, 1, 0);
        const playerLeftHandMaterial = new B.StandardMaterial(`${this.id}LeftHandMaterial`, this._scene);
        playerLeftHandMaterial.diffuseColor = this._color;
        this._leftHand.material = playerLeftHandMaterial;

        // create right hand
        this._rightHand = B.MeshBuilder.CreateSphere(`${this.id}RightHand`, { diameter: 0.2 }, this._scene);
        this._rightHand.position = new B.Vector3(1, 1, 0);
        const playerRightHandMaterial = new B.StandardMaterial(`${this.id}RightHandMaterial`, this._scene);
        playerRightHandMaterial.diffuseColor = this._color;
        this._rightHand.material = playerRightHandMaterial;
    }

    public setState(state: PlayerState): void {
        this._targetState = {...state};

        // Si c'est la première mise à jour ou si on n'a pas encore d'état cible,
        // appliquer directement l'état pour éviter des démarrages incorrects
        if (!this._head.position ||
            (this._head.position.x === 0 &&
                this._head.position.y === 1.7 &&
                this._head.position.z === 0)) {
            this._applyState(state);
        }
    }

    private _applyState(state: PlayerState): void {
        this._head.position = new B.Vector3(state.position.x, state.position.y, state.position.z);
        this._body.position = new B.Vector3(state.position.x, state.position.y - 1, state.position.z);
        this._head.lookAt(
            new B.Vector3(
                this._head.position.x + state.direction.x,
                this._head.position.y + state.direction.y,
                this._head.position.z + state.direction.z
            )
        );
        this._leftHand.position = new B.Vector3(state.leftHandPosition.x, state.leftHandPosition.y, state.leftHandPosition.z);
        this._rightHand.position = new B.Vector3(state.rightHandPosition.x, state.rightHandPosition.y, state.rightHandPosition.z);
    }

    public interpolateMovement(deltaTime: number): void {
        if (!this._targetState) return;
        const factor = Math.min(deltaTime * this.INTERPOLATION_SPEED, 1);

        const currentHeadPos = this._head.position;
        currentHeadPos.x += (this._targetState.position.x - currentHeadPos.x) * factor;
        currentHeadPos.y += (this._targetState.position.y - currentHeadPos.y) * factor;
        currentHeadPos.z += (this._targetState.position.z - currentHeadPos.z) * factor;

        this._body.position = new B.Vector3(currentHeadPos.x, currentHeadPos.y - 1, currentHeadPos.z);

        const targetDirection = new B.Vector3(
            currentHeadPos.x + this._targetState.direction.x,
            currentHeadPos.y + this._targetState.direction.y,
            currentHeadPos.z + this._targetState.direction.z
        );
        this._head.lookAt(targetDirection);

        const currentLeftHandPos = this._leftHand.position;
        currentLeftHandPos.x += (this._targetState.leftHandPosition.x - currentLeftHandPos.x) * factor;
        currentLeftHandPos.y += (this._targetState.leftHandPosition.y - currentLeftHandPos.y) * factor;
        currentLeftHandPos.z += (this._targetState.leftHandPosition.z - currentLeftHandPos.z) * factor;

        const currentRightHandPos = this._rightHand.position;
        currentRightHandPos.x += (this._targetState.rightHandPosition.x - currentRightHandPos.x) * factor;
        currentRightHandPos.y += (this._targetState.rightHandPosition.y - currentRightHandPos.y) * factor;
        currentRightHandPos.z += (this._targetState.rightHandPosition.z - currentRightHandPos.z) * factor;
    }
}