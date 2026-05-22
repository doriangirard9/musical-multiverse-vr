
import type { AbstractMesh } from "@babylonjs/core";
import type { Node3DParameter } from "../../Node3DParameter";

/**
 * Un paramètre numérique générique qui mappe une valeur 0-1 à une plage [min, max].
 */
export class NumberN3DParameter implements Node3DParameter {
    readonly id: string;
    meshes: AbstractMesh[];
    
    constructor(
        id: string,
        meshes: AbstractMesh[] = [],
        private min: number,
        private max: number,
        private setValueFn: (value: number) => void,
        private getValueFn: () => number,
        readonly getLabel: () => string,
        extension: string = "",
    ) {
        this.id = id;
        this.extension = extension;
        this.meshes = meshes;
    }

    private extension: string = "";

    setValue(value: number): void {
        // Convertir 0-1 en [min, max]
        const mapped = this.min + (this.max - this.min) * value;
        this.setValueFn(mapped);
    }

    getValue(): number {
        // Convertir [min, max] en 0-1
        const current = this.getValueFn();
        return (current - this.min) / (this.max - this.min);
    }

    getStepCount(): number {
        // Continuous parameter
        return 0;
    }

    stringify(value: number): string {
        const mapped = this.min + (this.max - this.min) * value;
        return `${mapped.toFixed(2)}${this.extension}`;
    }
}