import * as GUI from "@babylonjs/gui";
import { Scene } from "@babylonjs/core";
import {SceneManager} from "./SceneManager.ts";


export class UIManager {
    private static _instance: UIManager | null = null;

    private readonly scene: Scene;
    private readonly gui: GUI.AdvancedDynamicTexture;
    private readonly guiManager: GUI.GUI3DManager;

    private constructor(scene: Scene) {
        this.scene = scene;
        this.gui = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI",undefined, this.scene);
        this.guiManager = new GUI.GUI3DManager(this.scene);
        this.guiManager.controlScaling = 0.5;
    }

    public static initialize(){
        this._instance = new UIManager(SceneManager.getInstance().getScene())
    }

    public static getInstance(): UIManager {
        if (!UIManager._instance) throw new Error("UIManager not initialized. Call initialize() first.")
        return UIManager._instance
    }

    public getGui(): GUI.AdvancedDynamicTexture {
        return this.gui;
    }

    public getGui3DManager(): GUI.GUI3DManager {
        return this.guiManager;
    }

}