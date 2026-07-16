import type { AbstractMesh } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Paramètre pour un enum TypeScript.
 * Mappe 0-1 aux valeurs d'un enum.
 */
export class EnumN3DParameter<T extends string | number> implements Node3DParameter {
    private enumValues: T[]

    constructor(
        readonly id: string,
        readonly meshes: AbstractMesh[] = [],
        enumObj: Record<string, T>,
        private setValueFn: (value: T) => void,
        private getValueFn: () => T,
        readonly getLabel: () => string,
        private labelMap?: Record<T, string>,
    ) {
        this.id = id;
        this.meshes = meshes;
        // Extraire les valeurs numériques de l'enum
        this.enumValues = Object.values(enumObj).filter(
            (v) => typeof v === "number" || typeof v === "string"
        ) as T[];
        
        if (this.enumValues.length < 2) {
            throw new Error("EnumN3DParameter requires at least 2 enum values");
        }
    }

    setValue(value: number): void {
        this.setValueFn(this.enumValues[value])
    }

    getValue(): number {
        const current = this.getValueFn()
        return this.enumValues.indexOf(current)
    }

    getMin(): number { return 0 }
    getMax(): number { return this.enumValues.length-1 }
    getStepSize(): number { return 1 }
    getExponant(): number { return 1 }

    stringify(value: number): string {
        const enumValue = this.enumValues[value]
        const label = this.labelMap?.[enumValue] ?? String(enumValue)
        return `${label}`
    }
}
