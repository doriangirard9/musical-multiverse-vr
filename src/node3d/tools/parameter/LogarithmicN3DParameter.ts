import type { AbstractMesh } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Paramètre numérique avec échelle logarithmique.
 * Utile pour les fréquences, amplitudes, durées, etc.
 * Mappe 0-1 à [min, max] en échelle logarithmique.
 */
export class LogarithmicN3DParameter implements Node3DParameter {
    readonly id: string;
    meshes: AbstractMesh[];
    private logMin: number;
    private logMax: number;
    private label: string;

    constructor(
        id: string,
        meshes: AbstractMesh[] = [],
        private min: number,
        private max: number,
        private setValueFn: (value: number) => void,
        private getValueFn: () => number,
        readonly getLabel: () => string,
        private extension: string = "",
    ) {
        this.id = id;
        this.meshes = meshes;
        if (min <= 0 || max <= 0) {
            throw new Error("LogarithmicN3DParameter requires positive min and max values");
        }
        if (min >= max) {
            throw new Error("LogarithmicN3DParameter requires min < max");
        }
        this.logMin = Math.log(min);
        this.logMax = Math.log(max);
        this.label = getLabel();
    }

    setValue(value: number): void {
        // Convertir 0-1 en échelle logarithmique
        const clampedValue = Math.max(0, Math.min(1, value));
        const logValue = this.logMin + (this.logMax - this.logMin) * clampedValue;
        const mapped = Math.exp(logValue);
        this.setValueFn(mapped);
    }

    getValue(): number {
        // Convertir valeur logarithmique en 0-1
        const current = this.getValueFn();
        if (current <= 0) return 0;
        const logCurrent = Math.log(current);
        return (logCurrent - this.logMin) / (this.logMax - this.logMin);
    }

    getStepCount(): number {
        return 0; // Continu
    }

    stringify(value: number): string {
        const clampedValue = Math.max(0, Math.min(1, value));
        const logValue = this.logMin + (this.logMax - this.logMin) * clampedValue;
        const mapped = Math.exp(logValue);
        return `${this.label}: ${mapped.toFixed(2)}${this.extension}`;
    }
}
