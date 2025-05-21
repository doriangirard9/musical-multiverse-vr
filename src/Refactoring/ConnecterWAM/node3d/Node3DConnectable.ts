import { AbstractMesh, Color3 } from "@babylonjs/core"



/**
 * Un objet connectable (entrée ou sortie) d'un Node3D, connectable à une sortie d'un autre Node3D.
 */
export interface Node3DConnectable{

    /**
     * L'identifiant du connectable
     */
    id: string

    /**
     * Représente le paramètre dans la scène 3D.
     * On clique dessus et le drag pour le connecter à une sortie si c'est une entrée.
     * On peut aussi draguer vers lui poyr y connecter une entrée si c'est une sortie.
     */
    meshes: AbstractMesh[]

    /**
     * Un identifiant qui indique le type de connexion.
     * Il est unique pour chaque type d'entrée/sortie.
     */
    type: string|Symbol

    /**
     * Le nombre maximum de connexions connectables à cette entrée/sortie.
     * Si il n'est pas défini, il n'y a pas de limite.
     */
    max_connections?: number

    /**
     * La couleur de la connexion.
     * Pour un type de connexion particulier, une seule couleur est choisie donc
     * cette couleur peut être ignorée.
     */
    color: Color3
    
    /**
     * Si le connectable est une entrée ou une sortie.
     * Si il est bidirecitonnel il peut être connecté à une entrée ou une sortie.
     * On peut connecter une entrée à une sortie et une sortie à une entrée.
     * On peut connecter uen entrée ou une sortie à un connectable bidirectionnel.
     */
    direction: 'input'|'output'|'bidirectional'

    /**
     * Le nom du connectable.
     */
    getLabel(): string

    /**
     * Appelé lorsque l'entrée est connectée à une sortie.
     * Est appelé d'abord pour la sortie, puis pour l'entrée.
     * @param sender Une fonction qui peut être appelée pour envoyer une valeur au connectable à l'autre bout de la connexion.
     */
    connect(sender: (value:any)=>void): void
   
    /**
     * Appelé lorsque l'entrée est déconnectée d'une sortie.
     * Est appelé d'abord pour la sortie, puis pour l'entrée.
     * @param sender Une fonction qui peut être appelée pour envoyer une valeur au connectable à l'autre bout de la connexion.
     */
    disconnect(sender: (value:any)=>void): void

    /**
     * Appelé lorsque une valeur est envoyée à la connexion par la connexion à l'autre bout.
     * @param value La nouvelle valeur de l'entrée.
     */
    receive(value: any): void
}