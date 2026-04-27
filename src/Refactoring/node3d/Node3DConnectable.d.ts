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
     * Appelé quand sur le connectable d'entrée.
     * L'objet retourné est passé à la méthode {@link Node3DConnectable.connectAsOutput} du connectable de sortie.
     * @return Un objet qui sera passé à la méthode {@link Node3DConnectable.connectAsOutput} du connectable de sortie.
     */
    connectAsInput(): any

    /**
     * Appelé quand sur le connectable de sortie.
     * L'objet retourné est passé à la méthode {@link Node3DConnectable.connectAsInput} du connectable d'entrée.
     * @param value L'objet retourné par la méthode {@link Node3DConnectable.connectAsInput} du connectable d'entrée.
     */
    connectAsOutput(connection: any): void

    /**
     * Appelé lorsque l'entrée est déconnectée d'une sortie.
     * Est appelée avant la méthode {@link Node3DConnectable.disconnectAsOutput} du connectable de sortie.
     * @param connectable L'objet retourné par la méthode {@link Node3DConnectable.connectAsInput} du connectable d'entrée, ou par la méthode {@link Node3DConnectable.connectAsOutput} du connectable de sortie, selon le connectable qui est déconnecté.
     */
    disconnectAsInput(connection: any): void

    /**
     * Appelé lorsque la sortie est déconnectée d'une entrée.
     * Est appelée après la méthode {@link Node3DConnectable.disconnectAsInput} du connectable d'entrée.
     * @param connectable L'objet retourné par la méthode {@link Node3DConnectable.connectAsInput} du connectable d'entrée, ou par la méthode {@link Node3DConnectable.connectAsOutput} du connectable de sortie, selon le connectable qui est déconnecté.
     */
    disconnectAsOutput(connection: any): void
}