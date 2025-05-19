import { Node } from "@babylonjs/core"
import { Node3DContext } from "./Node3DContext"



/**
 * Représente l'interface d'un Node3D.
 */
export interface Node3DGUI{
    
    root: Node

    dispose(): Promise<void>

}



/**
 * Représente un Node3D.
 */
export interface Node3D{



    //// Set state / Get state / Synchronization ////

    /**
     * Met à jour l'état du Node3D.
     * Supporte une modification partielle de l'état pour optimiser la synchronisation.
     * @param state L'état du Node3D.
     * @param key La clé de l'état à mettre à jour. Si non défini, met à jour tout l'état.
     */
    setState(state: any, key?: string): Promise<void>

    /**
     * Récupère l'état du Node3D.
     * Supporte une récupération partielle de l'état pour optimiser la synchronisation.
     * @param key La clé de l'état à récupérer. Si non défini, récupère tout l'état.
     * @returns L'état du Node3D.
     */
    getState(key?: string): Promise<any>



    //// Lifetime ////

    /**
     * Appelle cette fonction pour libérer les ressources utilisées par le Node3D.
     */
    dispose(): Promise<void>



}



/**
 * Permet de créer un Node3D.
 */
export interface Node3DFactory<G extends Node3DGUI, T extends Node3D>{

    /**
     * Le nom du Node3D.
     */
    label: string

    /**
     * Crée l'interface graphique seule, peut être utilisée comme migniature d'un bouton.
     */
    createGUI(): Promise<G>

    /**
     * Crée le Node3D.
     * @param context Le contexte du Node3D.
     * @param gui L'interface graphique du Node3D.
     */
    create(context: Node3DContext, gui: G): Promise<T>

}


