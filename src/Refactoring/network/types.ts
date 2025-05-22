import {Position3D} from "../shared/SharedTypes.ts";

export type AudioOutputState = {
    id: string;
    position: Position3D;
    rotation: Position3D;
}
export type PlayerState = {
    id: string;
    position: { x: number, y: number, z: number };
    direction: { x: number, y: number, z: number };
    leftHandPosition: { x: number, y: number, z: number };
    rightHandPosition: { x: number, y: number, z: number };
}