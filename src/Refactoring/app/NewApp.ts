import {SceneManager} from "./SceneManager.ts";
import {XRManager} from "../xr/XRManager.ts";
import {Node3dManager} from "./Node3dManager.ts";
import {AppOrchestrator} from "./AppOrchestrator.ts";
import {CreateBox, ImportMeshAsync} from "@babylonjs/core";
import {N3DShop, N3DShopOptions} from "../world/shop/N3DShop.ts";
import {Node3DBuilder} from "./Node3DBuilder.ts";
import { TakableBehavior } from "../behaviours/boundingBox/TakableBehavior.ts";
import { InputManager } from "../xr/inputs/InputManager.ts";

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
        //await this.audioManager!!.createNode3d("audiooutput")

        const mesh = CreateBox("box", {size: 1}, scene)
        const behavior = new TakableBehavior("test")
        mesh.addBehavior(behavior)
        behavior.setBoundingBoxes([mesh.getHierarchyBoundingVectors(true)])

        const shared = this.audioManager?.builder?.shared!!

        window.addEventListener("keydown",e=>{
            if(e.key=="y")XRManager.getInstance().xrHelper.baseExperience.camera.position.set(0, 1.6, 0)
        })

        // setTimeout(()=>Inspector.Show(scene,{}), 10000)

        //// LE SUPER MAGASIN ////
        {
            // Mais qu'est ce donc ??? On peut rendre le magasin encore plus cool ????? J'ose pas mettre "true", c'est probablement TROP cool.
            let mode_magasin_super_giga_cool = false

            let shopOptions: N3DShopOptions
            if(mode_magasin_super_giga_cool) shopOptions = {
                kinds: Node3DBuilder.FACTORY_KINDS,
            }
            else shopOptions = N3DShop.BASE_OPTIONS

            const model = (await ImportMeshAsync(N3DShop.SHOP_MODEL_URL, scene)).meshes[0]
            model.position.set(0, -2.65, 60)
            model.scaling.scaleInPlace(.6)
            const shop = new N3DShop(
                model,
                shared,
                Node3dManager.getInstance(),
                InputManager.getInstance(),
                N3DShop.BASE_OPTIONS,
            )
            shop.showZone("default")
            window.addEventListener("keydown", async e=>{
                if(e.key=="s"){
                    console.log("zones", shop.zones)
                    const zone = shop.zones[Math.floor(Math.random()*shop.zones.length)]
                    console.log("Showing zone", zone)
                    await shop.showZone(zone)
                }
            })
        }
    }

}