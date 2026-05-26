import type { AbstractMesh } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Paramètre entier avec min et max.
 * Mappe 0-1 à [min, max] en valeurs entières.
 * Si exclusive=true, max n'est pas inclus (intervalle [min, max[).
 */
export class IntegerN3DParameter implements Node3DParameter {
    readonly id: string;
    meshes: AbstractMesh[];
    private label: string;
    private range: number;

    constructor(
        id: string,
        meshes: AbstractMesh[] = [],
        private min: number,
        private max: number,
        private setValueFn: (value: number) => void,
        private getValueFn: () => number,
        readonly getLabel: () => string,
        private extension: string = "",
        private exclusive: boolean = false,
    ) {
        this.id = id;
        this.meshes = meshes;
        const actualMax = exclusive ? max : max + 1;
        if (min >= actualMax) {
            throw new Error(`IntegerN3DParameter requires min < max (exclusive=${exclusive})`);
        }
        this.range = (exclusive ? max : max + 1) - min;
        this.label = getLabel();
    }

    setValue(value: number): void {
        // Convertir 0-1 en entier dans [min, max] ou [min, max[
        const clampedValue = Math.max(0, Math.min(1, value));
        const index = Math.floor(clampedValue * (this.range - 1));
        const mapped = this.min + index;
        this.setValueFn(mapped);
    }

    getValue(): number {
        // Convertir entier en 0-1
        const current = this.getValueFn();
        const index = current - this.min;
        return index / (this.range - 1);
    }

    getStepCount(): number {
        return this.range;
    }

    stringify(value: number): string {
        const clampedValue = Math.max(0, Math.min(1, value));
        const index = Math.floor(clampedValue * (this.range - 1));
        const mapped = this.min + index;
        return `${this.label}: ${Math.floor(mapped)}${this.extension}`;
    }
}
