import type { AbstractMesh, int } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Un paramètre discret avec un nombre limité d'options.
 * Mappe une valeur 0-1 à un index d'option.
 */
export class ChoiceN3DParameter implements Node3DParameter {
    readonly id: string;
    meshes: AbstractMesh[];
    
    constructor(
        id: string,
        meshes: AbstractMesh[] = [],
        private optionCount: number,
        private setValueFn: (index: number) => void,
        private getValueFn: () => number,
        readonly getLabel: () => string,
        private stringifyFn: (index: int) => string,
    ) {
        this.id = id;
        this.meshes = meshes;
        if (optionCount < 2) {
            throw new Error("ChoiceN3DParameter requires at least 2 options");
        }
    }

    setValue(value: number): void {
        // Convertir 0-1 en index d'option
        const clampedValue = Math.max(0, Math.min(1, value));
        const index = Math.floor(clampedValue * (this.optionCount - 1));
        this.setValueFn(index);
    }

    getValue(): number {
        // Convertir index en 0-1
        const currentIndex = this.getValueFn();
        return currentIndex / (this.optionCount - 1);
    }

    getStepCount(): number {
        // Nombre d'options disponibles
        return this.optionCount;
    }

    stringify(value: number): string {
        const clampedValue = Math.max(0, Math.min(1, value));
        const index = Math.floor(clampedValue * (this.optionCount - 1));
        return this.stringifyFn(index);
    }
}
