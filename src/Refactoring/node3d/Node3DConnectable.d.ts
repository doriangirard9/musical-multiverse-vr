import { AbstractMesh, Color3 } from "@babylonjs/core"



/**
 * Un objet connectable (entrée ou sortie) d'un Node3D, connectable à une sortie d'un autre Node3D.
 */
export interface Node3DConnectable{

    /**
     * L'identifiant du connectable
     */
    readonly id: string

    /**
     * Représente le paramètre dans la scène 3D.
     * On clique dessus et le drag pour le connecter à une sortie si c'est une entrée.
     * On peut aussi draguer vers lui poyr y connecter une entrée si c'est une sortie.
     */
    readonly meshes: AbstractMesh[]

    /**
     * Un identifiant qui indique le type de connexion.
     * Il est unique pour chaque type d'entrée/sortie.
     */
    readonly type: string|Symbol

    /**
     * Le nombre maximum de connexions connectables à cette entrée/sortie.
     * Si il n'est pas défini, il n'y a pas de limite.
     */
    readonly max_connections?: number

    /**
     * La couleur de la connexion.
     * Pour un type de connexion particulier, une seule couleur est choisie donc
     * cette couleur peut être ignorée.
     */
    readonly color: Color3
    
    /**
     * Si le connectable est une entrée ou une sortie.
     * Si il est bidirecitonnel il peut être connecté à une entrée ou une sortie.
     * On peut connecter une entrée à une sortie et une sortie à une entrée.
     * On peut connecter uen entrée ou une sortie à un connectable bidirectionnel.
     */
    readonly direction: 'input'|'output'|'bidirectional'

    /**
     * Le nom du connectable.
     */
    readonly label: string

    /**
     * Appelé lorsque l'entrée est connectée à une sortie.
     * Est appelé d'abord pour la sortie, puis pour l'entrée.
     * Les mêmes fonctions seront passées à la déconnexion, donc elles peuvent servir d'identifiant pour la connexion.
     * @param sender Une fonction qui peut être appelée pour envoyer une valeur au connectable à l'autre bout de la connexion.
     * @param power Une fonction qui peut être appelée pour envoyer une impulsion, utilisé pour les visuels. (les deux entre 0 et 1, un ton de 0 à 1 pour les connexions de type "signal", ou un ton de 0 est équivalent à un ton de 1).
     */
    connect(
        connectable: any,
        impulse: (strength:number, tone:number)=>void
    ): void
   
    /**
     * Appelé lorsque l'entrée est déconnectée d'une sortie.
     * Est appelé d'abord pour la sortie, puis pour l'entrée.
     * Les mêmes fonctions seront passées à la déconnexion, donc elles peuvent servir d'identifiant pour la connexion.
     * @param sender Une fonction qui peut être appelée pour envoyer une valeur au connectable à l'autre bout de la connexion.
     * @param power Une fonction qui peut être appelée pour envoyer une impulsion, utilisé pour les visuels. (les deux entre 0 et 1, un ton de 0 à 1 pour les connexions de type "signal", ou un ton de 0 est équivalent à un ton de 1)
     */
    disconnect(
        connectable: any,
        power: (strength:number, tone:number)=>void
    ): void
}