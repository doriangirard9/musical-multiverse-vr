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

const audioCtx: AudioContext = new AudioContext();

const audioEngine = await CreateAudioEngineAsync({audioContext:audioCtx})
await audioEngine.unlockAsync();

let onload = (): void => {
    const newApp: NewApp = NewApp.getInstance(audioCtx, audioEngine);
    newApp.start().then(() => {
        console.log("NewApp started");
    }).catch((error) => {
        console.error("Error starting NewApp:", error);
    });
}

if(document.readyState === "complete") onload()
else window.addEventListener("load", onload)

window.addEventListener('click', async (): Promise<void> => {
    await audioCtx.resume();
}, { once: true });