import type { AbstractMesh } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Paramètre entier avec min et max.
 * Mappe 0-1 à [min, max] en valeurs entières.
 * Si exclusive=true, max n'est pas inclus (intervalle [min, max[).
 */
export class IntegerN3DParameter implements Node3DParameter {

    constructor(
        readonly id: string,
        readonly meshes: AbstractMesh[] = [],
        private min: number,
        private max: number,
        private setValueFn: (value: number) => void,
        private getValueFn: () => number,
        readonly getLabel: () => string,
        private extension: string = "",
    ) { }

    setValue(value: number): void { this.setValueFn(value) }

    getValue(): number { return this.getValueFn() }

    getMin(): number { return this.min }
    getMax(): number { return this.max }
    getStepSize(): number { return 1 }
    getExponant(): number { return 1 }

    stringify(value: number): string {
        return `${value}${this.extension}`;
    }
}
