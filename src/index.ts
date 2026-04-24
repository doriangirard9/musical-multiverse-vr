import { CreateAudioEngineAsync } from "@babylonjs/core";
import { NewApp } from "./Refactoring/app/NewApp.ts";
import { authService, User } from "./Refactoring/auth/AuthService.ts";
import { LoginUI } from "./Refactoring/auth/LoginUI.ts";
import { GuestConversionUI } from "./Refactoring/ui/GuestConversionUI.ts";
import { UserMenuUI } from "./Refactoring/ui/UserMenuUI.ts";

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
 */


const DEBUG_LOG = false;

/**
 * Démarre l'application principale
 */
async function startApp(user: User): Promise<void> {
    if (DEBUG_LOG) console.log("Starting app for user:", user.username);

    const newApp: NewApp = new NewApp();
    try {
        await newApp.start();
        if (DEBUG_LOG) console.log("NewApp started");

        // Affiche le menu utilisateur (nom + déconnexion)
        new UserMenuUI();

        // Affiche le bouton "Sauvegarder mon travail" pour les invités
        new GuestConversionUI((convertedUser) => {
            console.log("Account converted:", convertedUser.username);
        });

    } catch(e) {
        console.error("Error during app initialization:", e);
    }
}

/**
 * Point d'entrée principal avec gestion de l'authentification
 */
let onload = async() => {
    // Vérifie si l'utilisateur est déjà connecté
    if (authService.isAuthenticated()) {
        const user = authService.getUser();
        if (user) {
            // Tente de rafraîchir le token pour vérifier qu'il est toujours valide
            const refreshed = await authService.refreshAccessToken();
            if (refreshed) {
                startApp(user);
                return;
            }
        }
    }

    // Sinon, affiche le formulaire de login
    new LoginUI((user: User) => {
        startApp(user);
    });
}

if(document.readyState === "complete") onload()
else window.addEventListener("load", onload)
