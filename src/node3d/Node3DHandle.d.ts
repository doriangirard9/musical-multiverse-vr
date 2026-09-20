/**
 * @module
 * @mergeModuleWith node3d-api
 */
import { Color3, Observable, Quaternion, Vector3 } from "@babylonjs/core"



/**
 * La position, l'orientation et l'échelle d'un Node3D dans le monde.
 * L'échelle est uniforme, un seul nombre suffit.
 */
export type Node3DFrame = {
    position: Vector3
    rotation: Quaternion
    scale: number
}



/**
 * Un paramètre d'un Node3D, vu à travers un {@link Node3DHandle}.
 * Les valeurs réelles sont dans l'unité du paramètre, les valeurs normalisées entre 0 et 1.
 */
export interface Node3DHandleParameter{

    /** L'identifiant du paramètre. */
    readonly id: string

    /** Le nom du paramètre. */
    getLabel(): string

    /** La valeur minimum du paramètre. */
    getMin(): number

    /** La valeur maximum du paramètre. */
    getMax(): number

    /** Le pas du paramètre, 0 si aucun. */
    getStepSize(): number

    /** L'exposant du paramètre, 1 si linéaire. */
    getExponant(): number

    /** La valeur du paramètre. */
    getValue(): number

    /** Change la valeur du paramètre, comme le ferait une main. */
    setValue(value: number): void

    /** La valeur du paramètre ramenée entre 0 et 1. */
    getNormalizedValue(): number

    /** Change la valeur du paramètre à partir d'une valeur entre 0 et 1. */
    setNormalizedValue(value: number): void

    /** Transforme une valeur du paramètre en texte. */
    stringify(value: number): string

    /** Notifié quand la valeur du paramètre change, avec la nouvelle valeur. */
    readonly onValueChanged: Observable<number>
}



/**
 * Une entrée ou une sortie d'un Node3D, vue à travers un {@link Node3DHandle}.
 */
export interface Node3DHandleConnectable{

    /** L'identifiant du connectable. */
    readonly id: string

    /** Le nom du connectable. */
    readonly label: string

    /** Le type de connexion, voir {@link Node3DConnectable.type}. */
    readonly type: string|Symbol

    /** Le sens du connectable. */
    readonly direction: 'input'|'output'|'bidirectional'

    /** La couleur de la connexion. */
    readonly color: Color3
}



/**
 * Un câble entre deux Node3D, vu à travers un {@link Node3DHandle}.
 */
export interface Node3DHandleConnection{

    /** Le Node3D du côté sortie. */
    readonly from: Node3DHandle

    /** L'identifiant du connectable de sortie. */
    readonly fromPort: string

    /** Le Node3D du côté entrée. */
    readonly to: Node3DHandle

    /** L'identifiant du connectable d'entrée. */
    readonly toPort: string

    /** Retire le câble. */
    disconnect(): void
}



/**
 * De quoi refaire un groupe de Node3D à l'identique: chacun avec son kind, son état et ses
 * paramètres, et les câbles qui les relient entre eux.
 *
 * C'est une photographie, elle ne suit plus les Node3D une fois prise, et elle est faite de
 * données simples, donc elle se range dans l'état d'un Node3D. Ce qu'il y a dedans appartient à
 * l'hôte: on ne le lit pas, on le rend tel quel à {@link Node3DContext.loadNodes}.
 */
export type Node3DGroupSnapshot = Record<string, any>



/**
 * Une poignée sur un Node3D, le sien ou un autre.
 * Elle permet de lire et changer ses paramètres, sa position, ses connexions, et de le cloner ou
 * le supprimer.
 *
 * Une poignée a une durée de vie: celle de la connexion qui l'a livrée, ou celle du Node3D qui
 * l'a demandée, ou celle du Node3D qu'elle représente, la plus courte des trois. Passé ce moment,
 * {@link Node3DHandle.isAlive} est faux, tout ce qui a été enregistré sur ses observables est
 * détaché, et plus rien de ce qu'on lui demande n'atteint le Node3D.
 */
export interface Node3DHandle{

    //// Identité ////

    /** L'identifiant réseau du Node3D, undefined tant qu'il n'est pas dans le monde partagé. */
    readonly id: string|undefined

    /** Le kind du Node3D, undefined tant qu'il n'est pas dans le monde partagé. */
    readonly kind: string|undefined

    /** Le nom du Node3D. */
    readonly label: string

    /** Faux une fois la poignée ou le Node3D détruit. */
    readonly isAlive: boolean

    /** Notifié une seule fois, quand la poignée cesse de valoir, quelle qu'en soit la raison. */
    readonly onDispose: Observable<void>



    //// Position et taille ////

    /** La position, l'orientation et l'échelle du Node3D dans le monde. */
    getFrame(): Node3DFrame

    /** Déplace le Node3D. Ce qui n'est pas donné est gardé. */
    setFrame(frame: Partial<Node3DFrame>): void

    /** La demi-étendue de la hitbox du Node3D dans le monde. */
    getExtent(): Vector3

    /** Notifié quand le Node3D bouge. */
    readonly onMove: Observable<void>

    /** Le Node3D peut-il être déplacé à la main. */
    isLocked: boolean

    /** Des mains le tiennent, ici, sur ce pair. */
    readonly isHeld: boolean

    /** Notifié quand des mains prennent le Node3D. */
    readonly onGrab: Observable<void>

    /** Notifié quand la dernière main lâche le Node3D. */
    readonly onRelease: Observable<void>



    //// Paramètres ////

    /** Les paramètres du Node3D. */
    getParameters(): Node3DHandleParameter[]

    /** Un paramètre du Node3D par son identifiant. */
    getParameter(id: string): Node3DHandleParameter|undefined

    /** Notifié quand un paramètre du Node3D change de valeur. */
    readonly onParameterChanged: Observable<{id: string, value: number}>



    //// Connexions ////

    /** Les entrées et sorties du Node3D. */
    getConnectables(): Node3DHandleConnectable[]

    /** Les câbles qui touchent le Node3D. */
    getConnections(): Node3DHandleConnection[]

    /**
     * Relie un connectable de ce Node3D à un connectable d'un autre.
     * @returns La raison du refus, ou null si le câble a été posé.
     */
    connect(portId: string, other: Node3DHandle, otherPortId: string): string|null



    //// Vie ////

    /** Supprime le Node3D du monde. */
    delete(): void

    /**
     * Crée une copie du Node3D, avec son état et ses paramètres mais sans ses câbles.
     * @param frame Où poser la copie. Ce qui n'est pas donné est pris sur l'original.
     * @returns La poignée sur la copie, ou null si elle n'a pu être créée.
     */
    clone(frame?: Partial<Node3DFrame>): Promise<Node3DHandle|null>
}
