import * as B from "@babylonjs/core";
import {v4} from "uuid";
import {NetworkManager} from "../network/NetworkManager.ts";
import {XRManager} from "../xr/XRManager.ts";
import {PlayerState} from "../network/types.ts";

export class PlayerManager{
    private static _instante : PlayerManager;
    private readonly _id : string = v4()
    private xrManager = XRManager.getInstance();
    private constructor() {}

    public static getInstance() : PlayerManager {
        if (!PlayerManager._instante) {
            PlayerManager._instante = new PlayerManager();
        }
        return PlayerManager._instante;
    }

    public _sendPlayerState(): void {
        if (!this.xrManager.xrHelper || !this.xrManager.xrHelper.baseExperience.camera) {
            console.error("XRManager camera is not initialized");
            return;
        }

        if (!this.xrManager.xrInputManager.leftController || !this.xrManager.xrInputManager.rightController) {
            return;
        }
        const xrCameraPosition: B.Vector3 = this.xrManager.xrHelper.baseExperience.camera.position;
        const xrCameraDirection: B.Vector3 = this.xrManager.xrHelper.baseExperience.camera.getDirection(B.Axis.Z);
        // @ts-ignore
        const xrLeftControllerPosition: B.Vector3 = this.xrManager.xrInputManager.leftController?.grip!.position;
        // @ts-ignore
        const xrRightControllerPosition: B.Vector3 = this.xrManager.xrInputManager.rightController?.grip!.position;

        const playerState: PlayerState = {
            id: this._id,
            position: {x: xrCameraPosition.x, y: xrCameraPosition.y, z: xrCameraPosition.z},
            direction: {x: xrCameraDirection.x, y: xrCameraDirection.y, z: xrCameraDirection.z},
            leftHandPosition: {
                x: xrLeftControllerPosition.x + 0.05,
                y: xrLeftControllerPosition.y,
                z: xrLeftControllerPosition.z - 0.2
            },
            rightHandPosition: {
                x: xrRightControllerPosition.x - 0.05,
                y: xrRightControllerPosition.y,
                z: xrRightControllerPosition.z - 0.2
            },
        }

        NetworkManager.getInstance().updatePlayerState(playerState);
    }

    public _getPlayerState() {
        const xrCameraPosition: B.Vector3 = this.xrManager.xrHelper.baseExperience.camera.position;
        const xrCameraDirection: B.Vector3 = this.xrManager.xrHelper.baseExperience.camera.getDirection(B.Axis.Z);

        if (!this.xrManager.xrInputManager.leftController || !this.xrManager.xrInputManager.rightController) {
            return;
        }
        // @ts-ignore
        const xrLeftControllerPosition: B.Vector3 = this.xrManager.xrInputManager.leftController?.grip!.position;
        // @ts-ignore
        const xrRightControllerPosition: B.Vector3 = this.xrManager.xrInputManager.rightController?.grip!.position;

        const playerState: PlayerState = {
            id: this._id,
            position: {x: xrCameraPosition.x, y: xrCameraPosition.y, z: xrCameraPosition.z},
            direction: {x: xrCameraDirection.x, y: xrCameraDirection.y, z: xrCameraDirection.z},
            leftHandPosition: {
                x: xrLeftControllerPosition.x + 0.05,
                y: xrLeftControllerPosition.y,
                z: xrLeftControllerPosition.z - 0.2
            },
            rightHandPosition: {
                x: xrRightControllerPosition.x - 0.05,
                y: xrRightControllerPosition.y,
                z: xrRightControllerPosition.z - 0.2
            },
        }
        return playerState;
    }

    public getId() {
        return this._id;
    }
}