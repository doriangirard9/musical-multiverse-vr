import {NetworkEventBus} from "../eventBus/NetworkEventBus.ts";
import {UIEventBus} from "../eventBus/UIEventBus.ts";
import {MenuEventBus} from "../eventBus/MenuEventBus.ts";

import {Node3dManager} from "./Node3dManager.ts";
import {UIManager} from "./UIManager.ts";
import {SceneManager} from "./SceneManager.ts";
import {PlayerManager} from "./PlayerManager.ts";
import {AudioEventBus} from "../eventBus/AudioEventBus.ts";
import {ConnectionManager} from "../iomanager/IOManager.ts";
import {IOEventBus} from "../eventBus/IOEventBus.ts";
import {NetworkManager} from "../network/NetworkManager.ts";
import { Node3DInstance } from "../node3d/instance/Node3DInstance.ts";


export class AppOrchestrator{
    private static instance: AppOrchestrator | null = null;

    private audioEventBus : AudioEventBus | null = null;
    private NetworkEventBus : NetworkEventBus | null = null;
    private UIEventBus : UIEventBus | null = null;
    private IOEventBus : IOEventBus | null = null;
    private MenuEventBus : MenuEventBus | null = null;
    private AudioManager : Node3dManager | null = null;
    private iOManager : ConnectionManager | null = null;
    private UIManager : UIManager | null = null;
    private SceneManager : SceneManager | null = null;
    private PlayerManager : PlayerManager | null = null;
    private ConnectionManager : ConnectionManager | null = null;
    private NetworkManager : NetworkManager | null = null;
    private constructor() {
        this.initManagers()

        this.onMenuEvent();
        this.onAudioEvent();
        //this.debugLogEvents()
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
        this.IOEventBus = IOEventBus.getInstance();

        // ---------------MANAGERS-------------------
        this.AudioManager = Node3dManager.getInstance();
        this.UIManager = UIManager.getInstance();
        this.SceneManager = SceneManager.getInstance();
        this.PlayerManager = PlayerManager.getInstance();
        this.iOManager = ConnectionManager.getInstance();
        this.NetworkManager = NetworkManager.getInstance();
    }

    private onMenuEvent(): void {
        this.MenuEventBus?.on('CREATE_AUDIO_NODE', async (payload) => {
            console.log(`Audio node created: ${payload.name}`);
            const node = await this.AudioManager?.createNode3d(payload.kind, payload.nodeId)
            if (node) {
                if(!(node instanceof Node3DInstance)){
                    this.UIManager?.showMessage(`Error: ${node}`, 2000)
                }
                
            }
        });
    }

    private onAudioEvent(): void {
        this.audioEventBus?.on('AUDIO_NODE_CREATED', () => {});
        this.audioEventBus?.on('AUDIO_NODE_LOADED', () => {});
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