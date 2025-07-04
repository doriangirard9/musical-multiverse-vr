import * as BABYLON from "@babylonjs/core";
import { Node3DParameter } from "./Node3DParameter";
import { Node3DConnectable } from "./Node3DConnectable";
import { Node3DButton } from "./Node3DButton";



/**
 * Représente le contexte d'un Node3D.
 * Implémenté par WAM Jam.
 * Une Node3D intéragit avec WAM Jam à travers cette interface.
 */
export interface Node3DContext{


    
    //// Context ////
    /**
     * Les classes utilitaires fourni par l'Host.
     */
    readonly tools: typeof import("./tools")

    /**
     * Le contexte audio dans lequel le Node3D est créé.
     */
    readonly audioCtx: AudioContext

    /**
     * Le group id du host Web Audio Module.
     */
    readonly groupId: string



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
    removeParameter(id: Node3DParameter["id"]): void



    //// Gestion des boutons ////

    /**
     * Créer un paramètre dans la scène 3D.
     * @param info Les informations du paramètre.
     */
    createButton(info: Node3DButton): void

    /**
     * Supprime un paramètre de la scène 3D.
     * @param mesh Le mesh du paramètre à supprimer.
     */
    removeButton(id: Node3DButton["id"]): void



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
    removeConnectable(id: Node3DConnectable["id"]): void



    //// La boite de collision ////

    /**
     * Demande à ce que la boite de collision qui peut être draggé
     * pour déplacer le Node3D contienne le mesh donné.
     */
    addToBoundingBox(mesh: BABYLON.AbstractMesh): void

    /**
     * Demande à ce que la boite de collision qui peut être draggé
     * pour déplacer le Node3D ne contienne plus le mesh donné.
     */
    removeFromBoundingBox(mesh: BABYLON.AbstractMesh): void



    //// Menu et GUI ////
    /**
     * Ouvre un menu avec des boutons décorés d'un texte et d'une icône optionnelle.
     * La fonction action est appelée lorsque le bouton est cliqué.
     * La fonction action est appelée après que le menu soit fermé.
     * @param choices Les choix du menu.
     */
    openMenu(choices: {label:string, icon?:BABYLON.TransformNode, action:()=>void}[]): void

    /**
     * Ferme le menu ouvert actuellement. Si celui-ci a été ouvert par cette Node3D.
     */
    closeMenu(): void

    /**
     * Affiche un message dans textuelle à l'utilisateur.
     */
    showMessage(message: string): void



    //// Gestion de la scène ////

    /**
     * Récupère la position de la tête du joueur dans la scène.
     */
    getPlayerPosition(): {position: BABYLON.Vector3, rotation: BABYLON.Quaternion}



    //// Gestion de la node3d dans la scène ////

    /**
     * Se supprime de la scène.
     */
    delete(): void

    /**
     * Récupère la position de la node3D dans le monde
     */
    getPosition(): {position: BABYLON.Vector3, rotation: BABYLON.Quaternion}
    


    //// Set state / Get state / Synchronization ////

    /**
     * Indique que l'état du Node3D a changé.
     * Il est possible de ne notifier qu'une partie de l'état.
     * @param key La clé de l'état à notifier.
     */
    notifyStateChange(key: string): void
    

}