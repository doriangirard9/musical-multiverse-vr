
import type { AbstractMesh } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Un paramètre numérique générique qui mappe une valeur 0-1 à une plage [min, max].
 */
export class NumberN3DParameter implements Node3DParameter {
    
    constructor(
        readonly id: string,
        readonly meshes: AbstractMesh[] = [],
        private min: number,
        private max: number,
        private setValueFn: (value: number) => void,
        private getValueFn: () => number,
        readonly getLabel: () => string,
        private extension: string = "",
        private exponant: number = 1,
    ) { }

    setValue(value: number): void {
        this.setValueFn(value)
    }

    getValue(): number {
        return this.getValueFn()
    }

    getMin(): number { return this.min }
    getMax(): number { return this.max }
    getStepSize(): number { return (this.max - this.min)/100 }
    getExponant(): number { return this.exponant }

    stringify(value: number): string {
        return `${value.toFixed(2)}${this.extension}`;
    }
}