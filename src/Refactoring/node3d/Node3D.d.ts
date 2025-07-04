import { TransformNode } from "@babylonjs/core"
import { Node3DContext } from "./Node3DContext"
import { Node3DGUIContext } from "./Node3DGUIContext"

type Serializable = { [key: string]: Serializable } | Serializable[] | string | number | boolean | null


/**
 * Représente l'interface d'un Node3D.
 */
export interface Node3DGUI{

    /**
     * La GUI de Node3D doit être compris dans un block de 1 sur 1 sur 1.
     * Une fois dans le monde, la taille de la GUI est multiplié par la valeur de cet attribut. 
     */
    worldSize: number
    
    root: TransformNode

    dispose(): Promise<void>

}



/**
 * Représente un Node3D.
 */
export interface Node3D{



    //// Set state / Get state / Synchronization ////
    /**
     * Met à jour un état du Node3D ou en crée un nouveau.
     * Supporte une modification partielle de l'état pour optimiser la synchronisation.
     * @param key La clé de l'état à mettre à jour.
     * @param state L'état du Node3D.
     */
    setState(key: string, state: Serializable|undefined): Promise<void>

    /**
     * Récupère l'état du Node3D.
     * Supporte une récupération partielle de l'état pour optimiser la synchronisation.
     * @param key La clé de l'état à récupérer.
     * @returns L'état du Node3D.
     */
    getState(key: string): Promise<Serializable|void>

    /**
     * Récupère toutes les clés d'état du Node3D.
     * @returns Une liste des clés des états du Node3D.
     */
    getStateKeys(): string[]



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
    createGUI(context: Node3DGUIContext): Promise<G>

    /**
     * Crée le Node3D.
     * @param context Le contexte du Node3D.
     * @param gui L'interface graphique du Node3D.
     */
    create(context: Node3DContext, gui: G): Promise<T>

}


