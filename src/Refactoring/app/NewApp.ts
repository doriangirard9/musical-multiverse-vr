import {SceneManager} from "./SceneManager.ts";
import {XRManager} from "../xr/XRManager.ts";
import {Node3dManager} from "./Node3dManager.ts";
import {AppOrchestrator} from "./AppOrchestrator.ts";
import ControlsUI from "./ControlsUI.ts";
import {AudioEngineV2, ImportMeshAsync} from "@babylonjs/core";
import {N3DShop, N3DShopOptions} from "../world/shop/N3DShop.ts";
import { InputManager } from "../xr/inputs/InputManager.ts";
import { parallel } from "../utils/utils.ts";
export class NewApp {
    private audioCtx: AudioContext | undefined;
    private audioEngine!: AudioEngineV2
    private sceneManager: SceneManager;
    private xrManager: XRManager | null = null;
    private audioManager: Node3dManager | null = null;
    private controlsUI?: ControlsUI;

    private constructor(audioContext?: AudioContext, audioEngine?: AudioEngineV2) {
        const canvas: HTMLCanvasElement = document.getElementById('renderCanvas') as HTMLCanvasElement;
        this.sceneManager = SceneManager.getInstance(canvas);
        if (audioContext !== undefined) {
            this.audioCtx = audioContext;
            this.audioEngine = audioEngine!!;
            this.audioManager = Node3dManager.getInstance(this.audioCtx, this.audioEngine);
            this.xrManager = XRManager.getInstance();
            AppOrchestrator.getInstance()
        }

    }

    private static instance?: NewApp

    public static getInstance(audioContext? : AudioContext, audioEngine?: AudioEngineV2): NewApp {
        if (!NewApp.instance) {
            if (!audioContext) {
                throw new Error("AudioContext is required for first instantiation");
            }
            NewApp.instance = new NewApp(audioContext, audioEngine);
        }
        return NewApp.instance;
    }

    public async start(): Promise<void> {
        const scene = this.sceneManager.getScene()
        
        this.sceneManager.start();
        // create left-side controls UI (HUD)
        this.controlsUI = new ControlsUI("320px");
        this.controlsUI.show();
        await this.xrManager!!.init(this.sceneManager.getScene(), this.audioEngine);
        
        // Setup X button to toggle controls UI
        InputManager.getInstance().x_button.on_change.add((event) => {
            if (event.pressed) {
                this.controlsUI?.toggle();
            }
        });
        
        //await this.audioManager!!.createNode3d("notesbox")
        /*
        //await this.audioManager!!.createNode3d("audiooutput")

        const mesh = CreateBox("box", {size: 1}, scene)
        mesh.rotation.x = Math.PI / 3
        mesh.bakeCurrentTransformIntoVertices()
        const behavior = new ShakeBehavior()
        mesh.addBehavior(behavior)
        behavior.on_shake = (p,c)=>{
            mesh.visibility = Math.max(0,1-p/10)
        }
        behavior.on_stop = (p,c)=>{
            mesh.visibility = 1
        }*/

        /*const menu = new Menu2(scene, {
            label: "Main",
            buttons: []
        })

        menu.plane.position.set(0, 1.5, 1)*/

        await this.audioManager!!.builder.init()

        const shared = this.audioManager?.builder?.getShared()!!

        window.addEventListener("keydown",async(e)=>{
            if(e.key=="p"){
                let prompt = window.prompt("Enter Node3D kind to create:")
                if(prompt) this.audioManager?.createNode3d(`desc:${prompt}`)
            }
            else if(e.key=="i"){
                scene.debugLayer.show()
            }
        })

        // setTimeout(()=>Inspector.Show(scene,{}), 10000)

        //// LE SUPER MAGASIN ////
        {
            await parallel(
                // Le magasin fixe, remplie entièrement, et accessible en marchant
                async()=>{
                    const model = (await ImportMeshAsync(N3DShop.LARGE_SHOP_MODEL_URL, scene)).meshes[0]
                    model.position.set(0, -1.5, 20)
                    model.scaling.scaleInPlace(.6)
                    const shop = new N3DShop(
                        model,
                        shared,
                        Node3dManager.getInstance(),
                        InputManager.getInstance(),
                        N3DShop.BASE_OPTIONS,
                    )
                    for(const zone of shop.zones.sort()){
                        await shop.showZone(zone,["camera"])
                    }
                },
                // Le magasin-menu, accessible via un bouton et dont les WAM sont chargé et déchargé dynamiquement
                async()=>{
                    const builder = this.audioManager?.builder!!
                    const categories: Record<string, Set<string>> = {}
                    const kinds = new Set<string>()
                    await Promise.all(builder.FACTORY_KINDS.map(async kind => {
                        try{
                            const factory = await builder.getFactory(kind)
                            if(!factory) return
                            kinds.add(kind)
                            for(const tag of factory.tags){
                                categories[tag] ??= new Set<string>()
                                categories[tag].add(kind)
                            }
                        }catch(e){}
                    }))
                    const options: N3DShopOptions = {
                        categories: Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, [...value]])),
                        kinds: [...kinds]
                    }

                    const model = (await ImportMeshAsync(N3DShop.BASE_SHOP_MODEL_URL, scene)).meshes[0]
                    model.position.set(0, -1.5, 60)
                    model.scaling.scaleInPlace(.6)
                    
                    let shop: N3DShop|null
                    InputManager.getInstance().y_button.on_down.addOnce(async()=>{
                        if(shop){
                            shop.dispose()
                        }
                        shop = new N3DShop(
                            model,
                            shared,
                            Node3dManager.getInstance(),
                            InputManager.getInstance(),
                            options,
                        )
                        shop.showZone("default")
                    })

                }
            )
        }
    }

}