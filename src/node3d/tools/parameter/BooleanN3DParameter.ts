import type { AbstractMesh } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Paramètre booléen (activé/désactivé).
 * Mappe 0-1 : [0, 0.5[ → false, [0.5, 1] → true.
 */
export class BooleanN3DParameter implements Node3DParameter {

    constructor(
        readonly id: string,
        readonly meshes: AbstractMesh[] = [],
        private setValueFn: (value: boolean) => void,
        private getValueFn: () => boolean,
        readonly getLabel: () => string,
    ) { }

    setValue(value: number): void {
        const boolValue = value >= 0.5;
        this.setValueFn(boolValue);
    }

    getValue(): number {
        return this.getValueFn() ? 1 : 0;
    }

    getMin(): number { return 0 }
    getMax(): number { return 0 }
    getStepSize(): number { return 1 }
    getExponant(): number { return 1 }

    stringify(value: number): string {
        const boolValue = value >= 0.5;
        return `${boolValue ? "Activé" : "Désactivé"}`;
    }
}
