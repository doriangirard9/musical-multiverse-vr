import type { TransformNode, AbstractMesh } from "@babylonjs/core";
import type { Node3DGUIContext } from "../../Node3DGUIContext";

/**
 * Paramètre d'agrandissement/rapetissement pour GUI Node3D
 * 
 * Propriétés:
 * - root: TransformNode racine
 * - Taille initiale: 1x1x1 centré sur (0,0,0)
 * - setValue(0-1): Scale de 0.3 à 1.0
 */
export class ScaleParameter {
    root: TransformNode;
    meshes: AbstractMesh[];
    private visual: AbstractMesh;
    private _value: number = 0;
    private readonly minScale = 0.3;
    private readonly maxScale = 1.0;

    constructor(name: string, context: Node3DGUIContext) {
        const { babylon: B, scene } = context;
        
        // Create root transform node (1x1x1 centered at origin)
        this.root = new B.TransformNode(`${name}_root`, scene);

        // Create visual sphere
        this.visual = B.CreateIcoSphere(
            `${name}_visual`,
            {
                radius: 0.5, // Fits within 1x1x1 boundary
                subdivisions: 3,
            },
            scene
        );
        this.visual.parent = this.root;
        this.visual.material = context.materialMat;

        // Expose all meshes for listeners
        this.meshes = [this.visual];

        this.setValue(0);
    }

    /**
     * Set the value (0-1) which controls scale (0.3-1.0)
     */
    setValue(value: number): void {
        this._value = Math.max(0, Math.min(1, value));
        const scale = this.minScale + this._value * (this.maxScale - this.minScale);
        this.visual.scaling.set(scale, scale, scale);
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
