import { AbstractMesh } from "@babylonjs/core"

/**
 * Un paramètre d'un Node3D, on peut changer sa valeur en le draggant.
 */
export interface Node3DParameter{

    /**
     * L'identifiant du paramètre.
     */
    id: string

    /**
     * Représente le paramètre dans la scène 3D.
     * Il est draggable.
     */
    mesh: AbstractMesh[]

    /**
     * Change la valeur du paramètre. Entre 0 et 1.
     * @param value 
     */
    setValue(value: number): void

    /**
     * Récupère le nombre de valeurs possibles du paramètre.
     * Par exemple, si il est égal à 3, le paramètre peut prendre les valeurs 0, 0.5 et 1. 
     */
    getStepCount(): number

    /**
     * Récupère la valeur du paramètre.
     * @returns 
     */
    getValue(): number

    /**
     * Transforme la valeur du paramètre en une représentation textuelle.
     * @returns 
     */
    stringify(value: number): string

    /**
     * Récupère le nom du paramètre.
     */
    getLabel(): string
}