import { CreateAudioEngineAsync } from "@babylonjs/core";
import { NewApp } from "./Refactoring/app/NewApp.ts";
import { HashRouter } from "./Refactoring/router/HashRouter.ts";
import { ROUTES } from "./Refactoring/router/routes.ts";
import { ApiClient } from "./Refactoring/auth/ApiClient.ts";
import { AuthService } from "./Refactoring/auth/AuthService.ts";
import { LoginPage } from "./Refactoring/ui/pages/LoginPage.ts";
import { RegisterPage } from "./Refactoring/ui/pages/RegisterPage.ts";
import { SessionBrowserPage } from "./Refactoring/ui/pages/SessionBrowserPage.ts";
import { ProjectsPage } from "./Refactoring/ui/pages/ProjectsPage.ts";
import { LoadingOverlay } from "./Refactoring/ui/pages/LoadingOverlay.ts";
import { SessionHUD } from "./Refactoring/ui/pages/SessionHUD.ts";
import { SessionConnector } from "./Refactoring/network/SessionConnector.ts";
import { SessionAPIClient } from "./Refactoring/network/SessionAPIClient.ts";
import * as Y from 'yjs';

// Filter out spammy wam3dgenerator console logs (memory allocation logs)
const originalConsoleLog = console.log;
console.log = function(...args: any[]) {
    if (args.length === 1 && typeof args[0] === 'number') return;
    originalConsoleLog.apply(console, args);
};

let appStarted = false;

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

                        const newApp = new NewApp();
                        await newApp.start(connectionInfo.participantId, sessionId);
                        appStarted = true;

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