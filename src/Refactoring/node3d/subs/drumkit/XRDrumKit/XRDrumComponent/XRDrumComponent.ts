import { AbstractMesh } from "@babylonjs/core";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";


interface XRDrumComponent {
    name: String;
    drumComponentContainer: TransformNode;

    playSoundOnTrigger(midiKey: number, duration: number) : void;
    animateOnHit(velocity: number, hitDirection?: Vector3) : void;
    createDrumComponentBody(body : AbstractMesh) : void;
    createDrumComponentTrigger(trigger : AbstractMesh) : void;
}

export default XRDrumComponent;