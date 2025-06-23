import { AbstractMesh, Color3 } from "@babylonjs/core"



/**
 * Un objet connectable (entrée ou sortie) d'un Node3D, connectable à une sortie d'un autre Node3D.
 */
export interface Node3DButton{

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
     * Le nom du connectable.
     */
    readonly label: string

    /**
     * La couleur du bouton
     */
    readonly color: Color3

    /**
     * Appelé lorsque le bouton est cliqué.
     * @param pressed 
     */
    press(): void

    /**
     * Appelé lorsque le bouton est relâché.
     */
    release(): void
}