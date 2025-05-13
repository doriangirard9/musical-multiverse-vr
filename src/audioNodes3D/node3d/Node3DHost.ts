import * as BABYLON from "@babylonjs/core";
import { Node3DParameter } from "./Node3DParameter";
import { Node3DConnectable } from "./Node3DConnectable";

/**
 * Représente le contexte d'un Node3D.
 * Implémenté par WAM Jam.
 * Une Node3D intéragit avec WAM Jam à travers cette interface.
 */
export interface Node3DContext{

    //// Context ////
    /**
     * La bibliothèque BabylonJS.
     */
    babylon: typeof BABYLON

    /**
     * La scène 3D dans laquelle le Node3D est créé.
     */
    scene: BABYLON.Scene

    /**
     * Le contexte audio dans lequel le Node3D est créé.
     */
    audioCtx: AudioContext

    /**
     * Le group id du host Web Audio Module.
     */
    hostGroupId: string



    //// Informations ////

    /**
     * Change le nom du Node3D.
     */
    setLabel(label: string): void



    //// Gestion des paramètres ////

    /**
     * Créer un paramètre dans la scène 3D.
     * @param info Les informations du paramètre.
     */
    createParameter(info: Node3DParameter): void

    /**
     * Supprime un paramètre de la scène 3D.
     * @param mesh Le mesh du paramètre à supprimer.
     */
    removeParameter(mesh: Node3DParameter["mesh"]): void



    //// Les entrées et sorties ////

    /**
     * Créer une entrée ou une sortie dans la scène 3D.
     * @param info Les informations de l'entrée ou de la sortie.
     */
    createConnectable(info: Node3DConnectable): void

    /**
     * Supprime une entrée ou une sortie de la scène 3D.
     * @param mesh Le mesh de l'entrée ou de la sortie à supprimer.
     */
    removeConnectable(mesh: Node3DConnectable["mesh"]): void



    //// La boite de collision ////

    /**
     * Demande à ce que la boite de collision qui peut être draggé
     * pour déplacer le Node3D contienne le mesh donné.
     */
    addToBoundingBox(mesh: Node3DConnectable["mesh"]): void

    /**
     * Demande à ce que la boite de collision qui peut être draggé
     * pour déplacer le Node3D ne contienne plus le mesh donné.
     */
    removeFromBoundingBox(mesh: Node3DConnectable["mesh"]): void



    //// Menu ////



    //// Gestion de la scène ////

    /**
     * Se supprime de la scène.
     */
    delete(): void
    


    //// Set state / Get state / Synchronization ////

    /**
     * Indique que l'état du Node3D a changé.
     * Il est possible de ne notifier qu'une partie de l'état.
     * @param key La clé de l'état à notifier. Si non défini, notifie que tout l'état a changé.
     */
    notifyStateChange(key?: string): void
    

}