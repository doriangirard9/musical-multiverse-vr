import {NetworkEventBus} from "../eventBus/NetworkEventBus.ts";
import {UIEventBus} from "../eventBus/UIEventBus.ts";
import {MenuEventBus} from "../eventBus/MenuEventBus.ts";

import {AudioManager} from "./AudioManager.ts";
import {UIManager} from "./UIManager.ts";
import {SceneManager} from "./SceneManager.ts";
import {PlayerManager} from "./PlayerManager.ts";
import {AudioEventBus} from "../eventBus/AudioEventBus.ts";


export class AppOrchestrator{
    private static instance: AppOrchestrator | null = null;

    private audioEventBus : AudioEventBus | null = null;
    private NetworkEventBus : NetworkEventBus | null = null;
    private UIEventBus : UIEventBus | null = null;
    private MenuEventBus : MenuEventBus | null = null;
    private AudioManager : AudioManager | null = null;
    private UIManager : UIManager | null = null;
    private SceneManager : SceneManager | null = null;
    private PlayerManager : PlayerManager | null = null;

    private constructor() {
        this.initManagers()

        this.onUIEvent();
        this.onMenuEvent();
        this.onAudioEvent();

        this.debugLogEvents()
    }

    public static getInstance(): AppOrchestrator {
        if (!AppOrchestrator.instance) {
            AppOrchestrator.instance = new AppOrchestrator();
        }
        return AppOrchestrator.instance;
    }

    private initManagers(){
        // ---------------EVENT BUS-------------------
        this.audioEventBus = AudioEventBus.getInstance();
        this.NetworkEventBus = NetworkEventBus.getInstance();
        this.UIEventBus = UIEventBus.getInstance();
        this.MenuEventBus = MenuEventBus.getInstance();

        // ---------------MANAGERS-------------------
        this.AudioManager = AudioManager.getInstance();
        this.UIManager = UIManager.getInstance();
        this.SceneManager = SceneManager.getInstance();
        this.PlayerManager = PlayerManager.getInstance();
    }

    private onUIEvent(): void {
        this.UIEventBus?.on('MAIN_MENU_ENABLE', () => {});
        this.UIEventBus?.on('MAIN_MENU_DISABLE', () => {});
    }

    private onMenuEvent(): void {
        this.MenuEventBus?.on('OPEN_MENU', (payload) => {
            console.log(`Menu opened: ${payload.menuId}`);
        });
        this.MenuEventBus?.on('CLOSE_MENU', (payload) => {
            console.log(`Menu closed: ${payload.menuId}`);
        });
        this.MenuEventBus?.on('CREATE_AUDIO_NODE', async (payload) => {
            console.log(`Audio node created: ${payload.name}`);
            const node = await this.AudioManager?.createAudioNode3D(payload.name, payload.nodeId, payload.configFile);

        });
    }

    private onAudioEvent(): void {
        this.audioEventBus?.on('WAM_CREATED', () => {});
        this.audioEventBus?.on('WAM_LOADED', () => {});
    }

    private debugLogEvents(): void {
        const audioEvents = (AudioEventBus.getInstance() as any).getAllEventTypes?.() || [];
        audioEvents.forEach((eventType: any) => {
            this.audioEventBus?.on(eventType, (payload) => {
                console.log(`[*] Audio Event Bus: ${eventType}`, payload);
            });
        });

        const networkEvents = (NetworkEventBus.getInstance() as any).getAllEventTypes?.() || [];
        networkEvents.forEach((eventType: any) => {
            this.NetworkEventBus?.on(eventType, (payload) => {
                console.log(`[*] Network Event Bus: ${eventType}`, payload);
            });
        });

        const uiEvents = (UIEventBus.getInstance() as any).getAllEventTypes?.() || [];
        uiEvents.forEach((eventType: any) => {
            this.UIEventBus?.on(eventType, (payload) => {
                console.log(`[*] UI Event Bus: ${eventType}`, payload);
            });
        });

        const menuEvents = (MenuEventBus.getInstance() as any).getAllEventTypes?.() || [];
        menuEvents.forEach((eventType: any) => {
            this.MenuEventBus?.on(eventType, (payload) => {
                console.log(`[*] Menu Event Bus: ${eventType}`, payload);
            });
        });


    }
}