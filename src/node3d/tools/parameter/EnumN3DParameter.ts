import type { AbstractMesh } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Paramètre pour un enum TypeScript.
 * Mappe 0-1 aux valeurs d'un enum.
 */
export class EnumN3DParameter<T extends string | number> implements Node3DParameter {
    readonly id: string;
    meshes: AbstractMesh[];
    private enumValues: T[];
    private label: string;

    constructor(
        id: string,
        meshes: AbstractMesh[] = [],
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
        this.label = getLabel();
    }

    setValue(value: number): void {
        const clampedValue = Math.max(0, Math.min(1, value));
        const index = Math.floor(clampedValue * (this.enumValues.length - 1));
        this.setValueFn(this.enumValues[index]);
    }

    getValue(): number {
        const current = this.getValueFn();
        const index = this.enumValues.indexOf(current);
        return index >= 0 ? index / (this.enumValues.length - 1) : 0;
    }

    getStepCount(): number {
        return this.enumValues.length;
    }

    stringify(value: number): string {
        const clampedValue = Math.max(0, Math.min(1, value));
        const index = Math.floor(clampedValue * (this.enumValues.length - 1));
        const enumValue = this.enumValues[index];
        const label = this.labelMap?.[enumValue] ?? String(enumValue);
        return `${this.label}: ${label}`;
    }
}
