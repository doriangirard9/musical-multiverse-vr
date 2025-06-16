import {SceneManager} from "./SceneManager.ts";
import {XRManager} from "../xr/XRManager.ts";
import {Node3dManager} from "./Node3dManager.ts";
import { AppOrchestrator } from "./AppOrchestrator.ts";
import { createStandCollection } from "../world/Node3DStand.ts";
import { ImportMeshAsync } from "@babylonjs/core";
import { Node3DShop } from "../world/Node3DShop.ts";
import { Node3DBuilder } from "./Node3DBuilder.ts";
import { Inspector } from "@babylonjs/inspector";

export class NewApp {
    private audioCtx: AudioContext | undefined;
    private sceneManager: SceneManager;
    private xrManager: XRManager | null = null;
    private audioManager: Node3dManager | null = null;

    private constructor(audioContext?: AudioContext) {
        const canvas: HTMLCanvasElement = document.getElementById('renderCanvas') as HTMLCanvasElement;
        this.sceneManager = SceneManager.getInstance(canvas);
        if (audioContext !== undefined) {
            this.audioCtx = audioContext;
            this.audioManager = Node3dManager.getInstance(this.audioCtx);
            this.xrManager = XRManager.getInstance();
            AppOrchestrator.getInstance()
        }

    }

    private static instance?: NewApp

    public static getInstance(audioContext? : AudioContext): NewApp {
        if (!NewApp.instance) {
            if (!audioContext) {
                throw new Error("AudioContext is required for first instantiation");
            }
            NewApp.instance = new NewApp(audioContext);
        }
        return NewApp.instance;
    }

    public async start(): Promise<void> {
        const scene = this.sceneManager.getScene()
        
        this.sceneManager.start();
        await this.xrManager!!.init(this.sceneManager.getScene());
        
        await this.audioManager!!.createNode3d("notesbox")
        await this.audioManager!!.createNode3d("audiooutput")

        const shared = this.audioManager?.builder?.shared!!

        //// LE SUPER MAGASIN ////
        {
            setTimeout(()=>Inspector.Show(scene,{}), 10000)
            // Mais qu'est ce donc ??? On peut rendre le magasin encore plus cool ????? J'ose pas mettre "true", c'est probablement TROP cool.
            let mode_magasin_super_giga_cool = false

            const model = (await ImportMeshAsync(Node3DShop.SHOP_MODEL_URL, scene)).meshes[0]
            model.position.set(0, -2.65, 50)
            model.scaling.scaleInPlace(.6)
            const shop = new Node3DShop(model, {order:"random"})
            let kinds = mode_magasin_super_giga_cool ? Node3DBuilder.FACTORY_KINDS : Node3DShop.SHOP_KINDS
            await shop.initialize(shared, Node3dManager.getInstance(), kinds)
        }
    }

}