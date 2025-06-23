import * as BABYLON from "@babylonjs/core";

/**
 * Représente le contexte de la GUI d'un Node3D.
 */
export interface Node3DGUIContext{

    
    //// Context ////
    /**
     * Les classes utilitaires fourni par l'Host.
     */
    readonly tools: typeof import("./tools")
    
    /**
     * La bibliothèque BabylonJS.
     */
    readonly babylon: typeof BABYLON

    /**
     * La scène 3D dans laquelle le Node3D est créé.
     */
    readonly scene: BABYLON.Scene


    /** Shared material with white specular */
    readonly materialMat: BABYLON.StandardMaterial

    /** Shared material with white specular */
    readonly materialShiny: BABYLON.StandardMaterial

    /** Shared material with a reflective metal-like material */
    readonly materialMetal: BABYLON.StandardMaterial

    /** Shared material with a white emissive color */
    readonly materialLight: BABYLON.StandardMaterial


    /**
     * Ajoute un effet de surbrillance autour d'un objet.
     * @param node 
     * @param color 
     */
    highlight(node: BABYLON.Node, color: BABYLON.Color3): void

    /**
     * Supprime l'effet de surbrillance d'un objet.
     */
    unhighlight(node: BABYLON.Node): void
}