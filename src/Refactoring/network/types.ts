import {Position3D} from "../shared/SharedTypes.ts";

export type PlayerState = {
    id: string;
    position: { x: number, y: number, z: number };
    direction: { x: number, y: number, z: number };
    leftHandPosition: { x: number, y: number, z: number };
    rightHandPosition: { x: number, y: number, z: number };
}