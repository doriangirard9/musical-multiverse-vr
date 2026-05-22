import type { AbstractMesh } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Paramètre booléen (activé/désactivé).
 * Mappe 0-1 : [0, 0.5[ → false, [0.5, 1] → true.
 */
export class BooleanN3DParameter implements Node3DParameter {
    readonly id: string;
    meshes: AbstractMesh[];
    private label: string;

    constructor(
        id: string,
        meshes: AbstractMesh[] = [],
        private setValueFn: (value: boolean) => void,
        private getValueFn: () => boolean,
        readonly getLabel: () => string,
    ) {
        this.id = id;
        this.meshes = meshes;
        this.label = getLabel();
    }

    setValue(value: number): void {
        const boolValue = value >= 0.5;
        this.setValueFn(boolValue);
    }

    getValue(): number {
        return this.getValueFn() ? 1 : 0;
    }

    getStepCount(): number {
        return 2; // 2 états
    }

    stringify(value: number): string {
        const boolValue = value >= 0.5;
        return `${this.label}: ${boolValue ? "Activé" : "Désactivé"}`;
    }
}
