import type { AbstractMesh } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Paramètre d'angle (0-360°).
 * Mappe 0-1 à [0, 360] degrés.
 */
export class AngleN3DParameter implements Node3DParameter {
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
        const degrees = clampedValue * 360;
        this.setValueFn(degrees);
    }

    getValue(): number {
        let current = this.getValueFn();
        // Normaliser l'angle dans [0, 360[
        current = current % 360;
        if (current < 0) current += 360;
        return current / 360;
    }

    getStepCount(): number {
        return 0; // Continu
    }

    stringify(value: number): string {
        const clampedValue = Math.max(0, Math.min(1, value));
        const degrees = clampedValue * 360;
        return `${this.label}: ${degrees.toFixed(1)}°`;
    }
}
