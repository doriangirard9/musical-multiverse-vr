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
     * Une description du Node3D.
     */
    description: string

    /**
     * Des tags pour catégoriser le Node3D.
     * Ces tags doivent être au singulier et tout en minuscules, sans accents, sans espace (utilisé des _) et en anglais.
     * Par exemple : "instrument", "effect", "generator", "midi", "audio", "synthetiser", "delay", "reverb", "live_instrument"
     * Des tags standards:
     *  "instrument": Un node3D qui prend en entrée du MIDI et qui produit du son.
     *  "generator": Un node3D qui produit du son, ou du midi sans entrée.
     *  "effect": Un node3D qui prend en entrée du son ou du midi et qui le modifie et le renvoie en sortie.
     *  "consumer": Un node3D qui consomme du son ou du midi et ne renvoie rien en sortie.
     *  "live_instrument": Un "generator" qui produit du son grâce à des intéractions en temps réel, comme un instrument de musique. (exemple: clavier)
     *  "midi": Un node3D qui produit ou consomme du MIDI.
     *  "audio": Un node3D qui produit ou consomme de l'audio
     */
    tags: string[]

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


