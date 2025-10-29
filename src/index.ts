import { CreateAudioEngineAsync } from "@babylonjs/core";
import {NewApp} from "./Refactoring/app/NewApp.ts";

/**
 * # Plan du code
 * Une description de quelques parties importantes du code.
 *
 * ## Créer un nouvel objet
 * Les objets manipulable et connectables (plugin, sortie audio, clavier,...) sont appelés des
 * Node3D. Pour créer un nouvel objet il faut implémenter les interface Node3D, Node3DFactory et Node3DGUI.
 * La classe Node3DInstance fait le lien entre les implémentation des objets et l'application.
 * 
 * ## Réseaux
 * La synchronisation réseau est géré par le système SyncManager/Synchronized.
 * Un objet doit implémenter Synchronized pour pouvoir être synchronisé. Le SyncManager est un genre
 * de registre qui permet de gérer les objets synchronisés. Quand un objet y est ajouté, il est automatique synchronisé, quand
 * un objet y est supprimé, il est désynchronisé.
 */


let onload = async() => {
    const newApp: NewApp = new NewApp()
    try{
        await newApp.start()
        console.log("NewApp started");
    }catch(e){
        console.error("Error during app initialization:", e);
    }
}

if(document.readyState === "complete") onload()
else window.addEventListener("load", onload)