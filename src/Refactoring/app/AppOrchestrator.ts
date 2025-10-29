import {NetworkEventBus} from "../eventBus/NetworkEventBus.ts";
import {UIEventBus} from "../eventBus/UIEventBus.ts";
import {MenuEventBus} from "../eventBus/MenuEventBus.ts";

import {Node3dManager} from "./Node3dManager.ts";
import {UIManager} from "./UIManager.ts";
import {AudioEventBus} from "../eventBus/AudioEventBus.ts";
import {IOEventBus} from "../eventBus/IOEventBus.ts";
import { Node3DInstance } from "../node3d/instance/Node3DInstance.ts";


export class AppOrchestrator{
    private static instance: AppOrchestrator | null = null;

    private audioEventBus : AudioEventBus | null = null;
    private NetworkEventBus : NetworkEventBus | null = null;
    private UIEventBus : UIEventBus | null = null;
    private MenuEventBus : MenuEventBus | null = null;

    private constructor() {

    }

    static async initialize(){
        this.instance = new AppOrchestrator();

        // ---------------EVENT BUS-------------------
        this.instance.audioEventBus = AudioEventBus.getInstance();
        this.instance.NetworkEventBus = NetworkEventBus.getInstance();
        this.instance.UIEventBus = UIEventBus.getInstance();
        this.instance.MenuEventBus = MenuEventBus.getInstance();
        IOEventBus.getInstance();
        this.instance.onMenuEvent();
        this.instance.onAudioEvent();
    }

    public static getInstance(): AppOrchestrator {
        if (!this.instance) throw new Error("AppOrchestrator not initialized. Call initialize() first.")
        return this.instance
    }

    private onMenuEvent(): void {
        this.MenuEventBus!!.on('CREATE_AUDIO_NODE', async (payload) => {
            console.log(`Audio node created: ${payload.name}`);
            const node = await Node3dManager.getInstance().createNode3d(payload.kind, payload.nodeId)
            if (node) {
                if(!(node instanceof Node3DInstance)){
                    UIManager.getInstance().showMessage(`Error: ${node}`, 2000)
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
            UIEventBus.getInstance().on(eventType, (payload) => {
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