import * as GUI from "@babylonjs/gui";
import { Scene } from "@babylonjs/core";
import {UIEventBus} from "../eventBus/UIEventBus.ts";
import {AudioEventBus} from "../eventBus/AudioEventBus.ts";
import {MessageManager} from "./MessageManager.ts";
import {SceneManager} from "./SceneManager.ts";


export class UIManager {
    private static _instance: UIManager | null = null;

    private readonly scene: Scene;
    private readonly gui: GUI.AdvancedDynamicTexture;
    private readonly guiManager: GUI.GUI3DManager;
    private messageManager: MessageManager;
    private uiEventBus: UIEventBus;
    private AudioEventBus: AudioEventBus;

    private constructor(scene: Scene) {
        this.scene = scene;
        this.gui = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
        this.guiManager = new GUI.GUI3DManager(this.scene);
        this.guiManager.controlScaling = 0.5;
        this.messageManager = new MessageManager(); // CHANGER MESSAGE MANAGER EN SINGLETON
        this.uiEventBus = UIEventBus.getInstance();
        this.AudioEventBus = AudioEventBus.getInstance();

        this.setupEventListeners();
    }

    public static getInstance(): UIManager {
        if (!UIManager._instance) {
            UIManager._instance = new UIManager(SceneManager.getInstance().getScene());
        }
        return UIManager._instance;
    }

    private setupEventListeners(): void {
        this.AudioEventBus.on("AUDIO_NODE_CREATED", () => this.messageManager.showMessage("Loading...", 0));
        this.AudioEventBus.on("AUDIO_NODE_LOADED", () => this.messageManager.hideMessage());
        this.AudioEventBus.on("AUDIO_NODE_ERROR", ({error_message}) => this.messageManager.showMessage(error_message,2000));
    }

    public getGui(): GUI.AdvancedDynamicTexture {
        return this.gui;
    }

    public getGui3DManager(): GUI.GUI3DManager {
        return this.guiManager;
    }

    public showMessage(message: string, duration: number): void {
        this.messageManager.showMessage(message, duration);
    }

    public hideMessage(): void {
        this.messageManager.hideMessage();
    }

}