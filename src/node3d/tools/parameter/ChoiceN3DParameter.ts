import type { AbstractMesh, int } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Un paramètre discret avec un nombre limité d'options.
 * Mappe une valeur 0-1 à un index d'option.
 */
export class ChoiceN3DParameter implements Node3DParameter {
    readonly id: string
    meshes: AbstractMesh[]
    
    constructor(
        id: string,
        meshes: AbstractMesh[] = [],
        private optionCount: number,
        private setValueFn: (index: number) => void,
        private getValueFn: () => number,
        readonly getLabel: () => string,
        private stringifyFn: (index: int) => string,
    ) {
        this.id = id
        this.meshes = meshes
        if (optionCount < 2) throw new Error("ChoiceN3DParameter requires at least 2 options")
    }

    setValue(value: number): void {
        this.setValueFn(value)
    }

    getValue(): number {
        return this.getValueFn()
    }

    getMin(): number { return 0 }
    getMax(): number { return this.optionCount - 1 }
    getStepSize(): number { return 1 }
    getExponant(): number { return 1 }

    stringify(value: number): string {
        return this.stringifyFn(value)
    }
}
