/**
 * @module WamJamParty
 */

export * as inputs from "./xr/inputs"
export * as node3dapi from "./node3d/node3dapi.ts"
export * as app from "./app"


import { App } from "./app/App.ts";
import { HashRouter } from "./router/HashRouter.ts";
import { ROUTES } from "./router/routes.ts";
import { ApiClient } from "./auth/ApiClient.ts";
import { AuthService } from "./auth/AuthService.ts";
import { LoginPage } from "./ui/pages/LoginPage.ts";
import { RegisterPage } from "./ui/pages/RegisterPage.ts";
import { SessionBrowserPage } from "./ui/pages/SessionBrowserPage.ts";
import { ProjectsPage } from "./ui/pages/ProjectsPage.ts";
import { LoadingOverlay } from "./ui/pages/LoadingOverlay.ts";
import { SessionHUD } from "./ui/pages/SessionHUD.ts";
import { SessionConnector } from "./network/SessionConnector.ts";
import { SessionAPIClient } from "./network/SessionAPIClient.ts";
import * as Y from 'yjs';

// Filter out spammy wam3dgenerator console logs (memory allocation logs)
const originalConsoleLog = console.log;
console.log = function(...args: any[]) {
    if (args.length === 1 && typeof args[0] === 'number') return;
    originalConsoleLog.apply(console, args);
};

let appStarted = false;
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
    // 1. Initialize services
    const apiClient = new ApiClient();
    const authService = new AuthService(apiClient);
    const sessionApiClient = new SessionAPIClient(apiClient);
    const router = new HashRouter();

    // 2. Setup UI Container
    let appRoot = document.getElementById('app-root');
    if (!appRoot) {
        appRoot = document.createElement('div');
        appRoot.id = 'app-root';
        document.body.appendChild(appRoot);
    }

    // 3. Setup Pages
    const loginPage = new LoginPage(authService, router);
    const registerPage = new RegisterPage(authService, router);
    const sessionBrowserPage = new SessionBrowserPage(authService, apiClient, router);
    const projectsPage = new ProjectsPage(apiClient, router);
    const loadingOverlay = new LoadingOverlay();
    const sessionHud = new SessionHUD(apiClient, router);

    let activeConnector: SessionConnector | null = null;

    // 4. Try to restore session
    await authService.tryRestoreSession();

    // 5. Handle Route Changes
    router.onRouteChange(async (route, prevRoute) => {
        // Hide all pages
        loginPage.hide();
        registerPage.hide();
        sessionBrowserPage.hide();
        projectsPage.hide();
        loadingOverlay.hide();
        
        // If leaving the app route, disconnect and hide HUD
        if (prevRoute?.path === ROUTES.APP && route.path !== ROUTES.APP) {
            sessionHud.hide();
            if (activeConnector) {
                await activeConnector.leave();
                activeConnector = null;
            }
            // If the app was started, we might need to reload to clean up BabylonJS state properly
            // as BabylonJS teardown can be tricky. For now, a hard reload is safest.
            if (appStarted) {
                window.location.reload();
                return;
            }
        }

        const isAuth = authService.isAuthenticated();

        switch (route.path) {
            case ROUTES.LOGIN:
                if (isAuth) router.replace(ROUTES.SESSIONS);
                else loginPage.show(appRoot!);
                break;

            case ROUTES.REGISTER:
                if (isAuth) router.replace(ROUTES.SESSIONS);
                else registerPage.show(appRoot!);
                break;

            case ROUTES.PROJECTS:
                if (!isAuth) router.replace(ROUTES.LOGIN);
                else projectsPage.show(appRoot!);
                break;

            case ROUTES.SESSIONS:
                sessionBrowserPage.show(appRoot!);
                break;

            case ROUTES.APP:
                const sessionId = route.params.session;
                const shareToken = route.params.share;
                
                if (!sessionId) {
                    router.replace(ROUTES.SESSIONS);
                    return;
                }

                // If joining via share token, wait a sec
                if (shareToken) {
                    // It will try to join with the token via the connector
                }

                if (!appStarted) {
                    loadingOverlay.show(appRoot!, 'Connecting to session...');
                    
                    try {
                        const doc = new Y.Doc();
                        activeConnector = new SessionConnector(
                            sessionId,
                            shareToken,
                            doc,
                            sessionApiClient,
                            (text) => loadingOverlay.updateText(text)
                        );

                        const connectionInfo = await activeConnector.connect();
                        
                        loadingOverlay.updateText('Loading 3D Environment...');

                        const newApp = new App();
                        console.log("START")
                        await newApp.start(connectionInfo.participantId, sessionId, doc);
                        appStarted = true;

                        // Now that Node3dManager is initialized, we can hydrate the CRDT state
                        await activeConnector.initCRDTState(connectionInfo.participantNumber, connectionInfo.crdtData);

                        loadingOverlay.hide();
                        sessionHud.show(appRoot!, sessionId, connectionInfo.sessionName, connectionInfo.maxUsers, connectionInfo.participantNumber); // approximate count

                    } catch (e: any) {
                        console.error('Failed to start app:', e);
                        loadingOverlay.hide();
                        alert(`Failed to join session: ${e.message}`);
                        router.replace(ROUTES.SESSIONS);
                    }
                } else {
                    // App already started, just show HUD
                    // Handled automatically if they don't reload
                }
                break;

            default:
                // Redirect unknown routes
                router.replace(isAuth ? ROUTES.SESSIONS : ROUTES.LOGIN);
                break;
        }
    });

    // 6. Start routing
    router.init();
};

if(document.readyState === "complete") onload();
else window.addEventListener("load", onload);