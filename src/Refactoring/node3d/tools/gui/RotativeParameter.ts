import type { TransformNode, AbstractMesh } from "@babylonjs/core";
import * as B from "@babylonjs/core";
import type { Node3DGUIContext } from "../../Node3DGUIContext";

/**
 * Paramètre rotatif (knob) pour GUI Node3D
 * 
 * Propriétés:
 * - root: TransformNode racine
 * - Taille: 1x1x1 centré sur (0,0,0)
 * - setValue(0-1): Rotation de 0 à 2π autour de l'axe Y
 */
export class RotativeParameter {
    root: TransformNode;
    meshes: AbstractMesh[];
    private visual: AbstractMesh;
    private markerBox: AbstractMesh;
    private _value: number = 0;

    constructor(name: string, context: Node3DGUIContext) {
        const { babylon: B, scene } = context;
        
        // Create root transform node (1x1x1 centered at origin)
        this.root = new B.TransformNode(`${name}_root`, scene);

        // Create visual cylinder (knob appearance)
        this.visual = B.CreateCylinder(
            `${name}_visual`,
            {
                height: 0.3,
                diameter: 0.8, // Fits within 1x1x1 boundary
            },
            scene
        );
        this.visual.parent = this.root;
        this.visual.material = context.materialMat;

        // Add a marker line to show rotation
        this.markerBox = B.CreateBox(
            `${name}_marker`,
            {
                width: 0.1,
                height: 0.05,
                depth: 0.4,
            },
            scene
        );
        this.markerBox.position.z = 0.4;
        this.markerBox.parent = this.visual;
        this.markerBox.material = context.materialMat;

        // Expose all meshes for listeners
        this.meshes = [this.visual, this.markerBox];

        this.setValue(0);
    }

    /**
     * Set the value (0-1) which controls rotation (0-2π)
     */
    setValue(value: number): void {
        this._value = Math.max(0, Math.min(1, value));
        this.visual.rotation.y = this._value * Math.PI * 2;
    }

    /**
     * Get current value (0-1)
     */
    getValue(): number {
        return this._value;
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.visual.dispose();
        this.root.dispose();
    }
}
