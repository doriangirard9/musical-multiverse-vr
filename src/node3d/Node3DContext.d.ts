/**
 * @module
 * @mergeModuleWith node3d-api
 */
import * as BABYLON from "@babylonjs/core";
import { Node3DParameter } from "./Node3DParameter";
import { Node3DConnectable } from "./Node3DConnectable";
import { Node3DButton } from "./Node3DButton";
import { InputManager } from "../xr/inputs/InputManager";
import { ControllerInput } from "../xr/inputs/ControllerInput";
import { ToolKind } from "../tool/ToolKind";
import { InstrumentInteractionSystem } from "../instrument/InstrumentInteractionSystem";



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
     * Le moteur audio de babylon.js.
     */
    readonly audioEngine: BABYLON.AudioEngineV2

    /**
     * Le gestionnaire d'inputs du WAM Jam.
     */
    inputs: InputManager

    /**
     * Les intéractions physiques entre les points de matière du monde et les meshes des instruments.
     *
     * Un point de matière est un `Interactor`: la tête d'une baguette, un bout de doigt, le bout
     * d'un rayon. Le Node3D n'en crée pas et n'en déplace pas, il écoute ce qu'ils rencontrent.
     * La façon usuelle de s'en servir n'est pas d'écouter ce système directement mais d'attacher
     * un des behaviours de {@link Node3DContext.instrument} à un mesh.
     */
    readonly interaction: InstrumentInteractionSystem

    /**
     * Les classes qui font d'un mesh un instrument jouable: les behaviours à attacher à un mesh
     * pour qu'il soit frappé, tenu, pincé, frotté, pressé, ou seulement désigné.
     *
     * Un behaviour s'attache comme tout behaviour babylon, et se détache dans le dispose du Node3D:
     * ```ts
     * const strike = new context.instrument.StrikeBehavior({
     *     onHit: (force) => this.play(note, Math.min(1, force)),
     * })
     * strike.attach(gui.pad)
     * ```
     */
    readonly instrument: typeof import("../instrument")

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
    openMenu(choices: {label:string, color?:string, click?:()=>void}[], options?: { showCloseBar?: boolean, dragToScroll?: boolean }): void

    /**
     * Ferme le menu ouvert actuellement. Si celui-ci a été ouvert par cette Node3D.
     */
    closeMenu(): void

    /**
     * Affiche un message dans textuelle à l'utilisateur.
     */
    showMessage(message: string): void

    /**
     * Envoie un signal coloré.
     * Il est peut être représenté de différentes façons selon les choix de l'implémentation.
     * C'est un élément visuel.
     */
    sendSignal(position: BABYLON.Vector3, red: number, green: number, blue: number): void



    //// Gestion des outils ////

    /**
     * Équipe la main qui tient le controller donné avec un outil sur mesure,
     * qui n'a pas besoin d'être dans le catalogue proposé à l'utilisateur.
     * L'autre main garde ce qu'elle tient.
     *
     * L'outil précédent est rendu à la main quand l'objet retourné est disposé,
     * ou automatiquement à la suppression du Node3D. Si entre temps l'utilisateur
     * a lui même choisi un autre outil pour cette main, son choix est gardé.
     *
     * @param controller Le controller de la main à équiper.
     * @param kind L'outil à mettre dans cette main.
     */
    equipTool(controller: ControllerInput, kind: ToolKind): {dispose(): void}



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


    //// General ////

    /**
     * Enregistre un observateur sur un observable.
     * L'observeur est automatiquement détaché lorsque le Node3D est supprimé de la scène.
     * @param observable L'observable sur lequel enregistrer l'observateur.
     * @param observer L'observateur à enregistrer.
     */
    observe<T>(observable: BABYLON.Observable<T>, observer: (eventData: T, eventState: BABYLON.EventState) => void): BABYLON.Observer<T>
    
    //// Gestion de l'environnement sonore ////

    /**
     * Crée un noeud de sortie audio qui peut être utilisé pour envoyer du son dans l'espace 3D.
     * Le noeud de sortie audio sera positionné à la position spécifiée et orienté dans la direction avant spécifiée.
     * @param position La position du noeud de sortie audio dans l'espace 3D. Il s'agit d'une fonction qui retourne un Vector3 représentant la position. 
     * @param forward La direction avant du noeud de sortie audio dans l'espace 3D. Il s'agit d'une fonction qui retourne un Vector3 représentant la direction avant. 
     */
    createOutputNode(position:()=>BABYLON.Vector3, forward:()=>BABYLON.Vector3): {pannerNode:PannerNode, dispose():void}

    /**
     * Ajoute un filtre audio dans l'environnement sonore.
     * Le filtre est appliqué à la totalité de la scène 3D et n'est pas localisé.
     * @param input Le noeud d'entrée du filtre.
     * @param output Le noeud de sortie du filtre.
     * @param order L'ordre du filtre. Les filtres sont appliqués dans l'ordre croissant.
     * @returns Une fonction qui permet de retirer le filtre ajouté.
     */
    addFilter(input: AudioNode, output: AudioNode, order: number): ()=>void
}