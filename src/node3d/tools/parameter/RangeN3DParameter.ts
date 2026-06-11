import type { AbstractMesh } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Paramètre d'intervalle avec min et max.
 * Gère deux valeurs liées : rangeMin et rangeMax.
 * Mappe 0-1 à un intervalle dans [globalMin, globalMax].
 */
export class RangeN3DParameter implements Node3DParameter {
    readonly id: string;
    meshes: AbstractMesh[];
    private label: string;

    constructor(
        id: string,
        meshes: AbstractMesh[] = [],
        private globalMin: number,
        private globalMax: number,
        private setRangeFn: (min: number, max: number) => void,
        private getRangeFn: () => { min: number; max: number },
        readonly getLabel: () => string,
        private extension: string = "",
    ) {
        this.id = id;
        this.meshes = meshes;
        if (globalMin >= globalMax) {
            throw new Error("RangeN3DParameter requires globalMin < globalMax");
        }
        this.label = getLabel();
    }

    setValue(value: number): void {
        // Le paramètre 0-1 contrôle la largeur et position de l'intervalle
        // 0 = intervalle petit au début, 1 = intervalle petit à la fin
        const clampedValue = Math.max(0, Math.min(1, value));
        const span = this.globalMax - this.globalMin;
        
        // Largeur de l'intervalle : minimum 10% du span
        const rangeWidth = span * 0.1 + span * 0.8 * (1 - Math.abs(2 * clampedValue - 1));
        
        // Position de l'intervalle
        const center = this.globalMin + clampedValue * span;
        const rangeMin = Math.max(this.globalMin, center - rangeWidth / 2);
        const rangeMax = Math.min(this.globalMax, center + rangeWidth / 2);
        
        this.setRangeFn(rangeMin, rangeMax);
    }

    getValue(): number {
        const range = this.getRangeFn();
        const span = this.globalMax - this.globalMin;
        const center = (range.min + range.max) / 2;
        return (center - this.globalMin) / span;
    }

    getStepCount(): number {
        return 0; // Continu
    }

    stringify(_value: number): string {
        const range = this.getRangeFn();
        return `${this.label}: [${range.min.toFixed(2)}, ${range.max.toFixed(2)}]${this.extension}`;
    }
}
