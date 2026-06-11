import type { TransformNode, AbstractMesh } from "@babylonjs/core";
import * as B from "@babylonjs/core";
import type { Node3DGUIContext } from "../../Node3DGUIContext";

/**
 * Paramètre de choix (choice/enum) pour GUI Node3D
 * 
 * Propriétés:
 * - root: TransformNode racine
 * - meshes: Liste des meshes (pour ajouter des listeners)
 * - Taille: 1x1x1 centré sur (0,0,0)
 * - setValue(0-1): Sélectionne l'option (0 = première, 1 = dernière)
 */
export class ChoiceParameter {
    root: TransformNode;
    meshes: AbstractMesh[];
    private options: AbstractMesh[];
    private _value: number = 0;
    private _selectedIndex: number = 0;
    readonly optionCount: number;

    constructor(name: string, context: Node3DGUIContext, optionCount: number = 4) {
        const { babylon: B, scene } = context;
        
        this.optionCount = optionCount;
        this.options = [];
        this.meshes = [];

        // Create root transform node
        this.root = new B.TransformNode(`${name}_root`, scene);

        // Create option spheres arranged in a circle
        const angleStep = (Math.PI * 2) / optionCount;
        const radius = 0.4;

        for (let i = 0; i < optionCount; i++) {
            const angle = angleStep * i;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            const option = B.CreateIcoSphere(
                `${name}_option_${i}`,
                {
                    radius: 0.15,
                    subdivisions: 2,
                },
                scene
            );
            option.position.set(x, 0, z);
            option.parent = this.root;
            option.material = context.materialMat;

            this.options.push(option);
            this.meshes.push(option);
        }

        this.setValue(0);
    }

    /**
     * Set the value (0-1) which controls selected option
     */
    setValue(value: number): void {
        this._value = Math.max(0, Math.min(1, value));
        this._selectedIndex = Math.floor(this._value * this.optionCount) % this.optionCount;
        
        // Update visual: highlight selected, dim others
        this.options.forEach((opt, i) => {
            if (i === this._selectedIndex) {
                opt.scaling.set(1.2, 1.2, 1.2); // Highlight
            } else {
                opt.scaling.set(0.8, 0.8, 0.8); // Dim
            }
        });
    }

    /**
     * Get current value (0-1)
     */
    getValue(): number {
        return this._value;
    }

    /**
     * Get current selected index (0 to optionCount-1)
     */
    getSelectedIndex(): number {
        return this._selectedIndex;
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.options.forEach(opt => opt.dispose());
        this.root.dispose();
    }
}
