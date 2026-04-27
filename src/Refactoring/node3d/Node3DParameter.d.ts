import { AbstractMesh, Vector3 } from "@babylonjs/core"

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
    meshes: AbstractMesh[]

    /**
     * Est-ce que le paramètre doit ne pas être automatiquement synchronisé
     */
    notSynced?: boolean

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

    /**
     * Optionnel.
     * Permet de définir une fonction de conversion de l'offset de drag en valeur du paramètre.
     * Utile pour personnaliser le comportement de drag, par exemple pour faire un drag horizontal au lieu de vertical, ou pour faire un drag en rotation.
     * Par défaut, l'offset de position sur l'axe Y d'un point situé à 1 unité de distance à l'avant est utilisé.
     * @param positionOffset L'offset de position du drag par rapport à la position initiale du drag.
     * @param directionOffset La direction du drag par rapport à la direction initiale du drag.
     */
    fromOffset?(positionOffset: Vector3, directionOffset: Vector3): number
}