import type { AbstractMesh } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Paramètre en pourcentage (0-100%).
 * Mappe 0-1 à [0, 100].
 */
export class PercentageN3DParameter implements Node3DParameter {
    readonly id: string;
    meshes: AbstractMesh[];
    private label: string;

    constructor(
        id: string,
        meshes: AbstractMesh[] = [],
        private setValueFn: (value: number) => void,
        private getValueFn: () => number,
        readonly getLabel: () => string,
    ) {
        this.id = id;
        this.meshes = meshes;
        this.label = getLabel();
    }

    setValue(value: number): void {
        const clampedValue = Math.max(0, Math.min(1, value));
        const percentage = clampedValue * 100;
        this.setValueFn(percentage);
    }

    getValue(): number {
        const current = this.getValueFn();
        return Math.max(0, Math.min(1, current / 100));
    }

    getStepCount(): number {
        return 0; // Continu
    }

    stringify(value: number): string {
        const clampedValue = Math.max(0, Math.min(1, value));
        const percentage = clampedValue * 100;
        return `${this.label}: ${percentage.toFixed(1)}%`;
    }
}
