/**
 * @module
 * @mergeModuleWith node3d-api
 */
import { AbstractMesh, Vector3 } from "@babylonjs/core"

/**
 * Un paramètre d'un Node3D. Sa valeur peut être changé en le draggant.
 * Sa valeur peut être aussi changé par la synchronisation, ou par automation.
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
     * Est-ce que le paramètre doit ne pas être automatiquement synchronisé.
     * Si le paramètre est contrôlé par une automation, alors il n'est plus synchronisé.
     */
    notSynced?: boolean


    //// Real value information ////
    /* Change la valeur du paramètre. */
    setValue(value: number, automated?: boolean): void

    /* Récupère l'exposant du paramètre, 1 si linéaire, 2 si quadratique, .5 si racine carrée, etc. */
    getExponant(): number

    /* Récupère la valeur minimum du paramètre. */
    getMin(): number

    /* Récupère la valeur maximum du paramètre. */
    getMax(): number

    /* Récupère le pas du paramètre, 0 si aucun. */
    getStepSize(): number

    /** Récupère la valeur du paramètre. */
    getValue(): number

    /** Transforme la valeur du paramètre en une représentation textuelle. */
    stringify(value: number): string

    /** Récupère le nom du paramètre. */
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