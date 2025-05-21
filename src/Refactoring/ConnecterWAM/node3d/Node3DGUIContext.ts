import * as BABYLON from "@babylonjs/core";

/**
 * Représente le contexte de la GUI d'un Node3D.
 */
export interface Node3DGUIContext{

    
    //// Context ////
    /**
     * La bibliothèque BabylonJS.
     */
    readonly babylon: typeof BABYLON

    /**
     * La scène 3D dans laquelle le Node3D est créé.
     */
    readonly scene: BABYLON.Scene


}