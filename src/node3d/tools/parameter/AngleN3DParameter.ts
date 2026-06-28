import type { AbstractMesh } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Paramètre d'angle (0-360°).
 * Mappe 0-1 à [0, 360] degrés.
 */
export class AngleN3DParameter implements Node3DParameter {

    constructor(
        readonly id: string,
        readonly meshes: AbstractMesh[] = [],
        private setValueFn: (value: number) => void,
        private getValueFn: () => number,
        readonly getLabel: () => string,
    ) { }

    setValue(value: number): void { this.setValueFn(value) }

    getValue(): number { return this.getValueFn() }

    getMin(): number { return 0 }
    getMax(): number { return 360 }
    getStepSize(): number { return 1 }
    getExponant(): number { return 1 }

    stringify(value: number): string {
        return `${this.getLabel()}: ${value.toFixed(1)}°`;
    }
}
