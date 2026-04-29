import {NewApp} from "./Refactoring/app/NewApp.ts";

// Filter out spammy wam3dgenerator console logs (memory allocation logs)
const originalConsoleLog = console.log;
console.log = function(...args: any[]) {
    // Filter out numeric-only logs from wam3dgenerator (memory size logs)
    if (args.length === 1 && typeof args[0] === 'number') {
        return; // Skip these logs
    }
    originalConsoleLog.apply(console, args);
};

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
 * 
 * ## Structure
 * Les différentes parties du problème sont gérés par des services différents accessibles statiquements.
 * - Node3DManager: Gère les Node3D (connections et node), leur ajout à la scène, leur suppression de la scène, leur synchronisation.
 * - SceneManager: Gère la création de la scène babylonjs
 * - Node3DBuilder: Gère les Node3DFactories, qui permettent d'instantier des Node3D. Les associe à leur identifiant pour pouvoir les instancier à partir de leur identifiant.
 * - 
 * 
 */


const DEBUG_LOG = false;

let onload = async() => {
    const newApp: NewApp = new NewApp()
    try{
        await newApp.start()
        if (DEBUG_LOG) console.log("NewApp started");
    }catch(e){
        console.error("Error during app initialization:", e);
    }
}

if(document.readyState === "complete") onload()
else window.addEventListener("load", onload)