import {SceneManager} from "./SceneManager.ts";
import {XRManager} from "../xr/XRManager.ts";
import {Node3dManager} from "./Node3dManager.ts";
import {AppOrchestrator} from "./AppOrchestrator.ts";
import ControlsUI from "./ControlsUI.ts";
import {CreateAudioEngineAsync, ImportMeshAsync} from "@babylonjs/core";
import {N3DShop, N3DShopOptions} from "../world/shop/N3DShop.ts";
import { InputManager } from "../xr/inputs/InputManager.ts";
import { parallel } from "../utils/utils.ts";
import { UIManager } from "./UIManager.ts";
import { NetworkManager } from "../network/NetworkManager.ts";
import { PlayerManager } from "./PlayerManager.ts";
import { ConnectionManager } from "../iomanager/ConnectionManager.ts";
export class NewApp {
    private static readonly DEBUG_LOG = false;
    private controlsUI?: ControlsUI;

    constructor() {}


    private static instance?: NewApp

    public static getInstance(): NewApp {
        if (!NewApp.instance) throw new Error("NewApp not initialized. Create an instance first.")
        return NewApp.instance;
    }

    public async start(): Promise<void> {
        NewApp.instance = this


        // Intialization of scene
        SceneManager.initialize()


        // Initialization of Audio Context
        const audioContext = new AudioContext()
        await new Promise<void>(r=>{
            window.addEventListener('click',
                async() => {
                    await audioContext.resume();
                    r()
                }, 
                { once: true }
            )
        })
        
        const audioEngine = await CreateAudioEngineAsync({audioContext})
        await audioEngine.unlockAsync()


        // Initialization of App Parts
        UIManager.initialize()

        await Node3dManager.initialize(audioContext, audioEngine)
        
        PlayerManager.initialize()
        NetworkManager.initialize()
        ConnectionManager.initialize()

        await AppOrchestrator.initialize()

        SceneManager.getInstance().start();

        await XRManager.getInstance()!!.init(SceneManager.getInstance().getScene(), audioEngine);

        // Get things
        const scene = SceneManager.getInstance().getScene()
        const node3dManager = Node3dManager.getInstance()
        const node3dBuilder = node3dManager.builder
        const node3dShared = node3dBuilder.getShared()
        
        // create 3D controller button labels
        this.controlsUI = new ControlsUI();
        
        // Setup X button to toggle controls UI
        InputManager.getInstance().x_button.on_change.add((event) => {
            if (event.pressed) {
                this.controlsUI?.toggle();
            }
        });

        if (NewApp.DEBUG_LOG) console.log(node3dShared)

        window.addEventListener("keydown",async(e)=>{
            if(e.key=="p"){
                let prompt = window.prompt("Enter Node3D kind to create:")
                if(prompt) node3dManager.createNode3d(`desc:${prompt}`)
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
                        node3dShared,
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
                    const categories: Record<string, Set<string>> = {}
                    const kinds = new Set<string>()
                    await Promise.all(node3dBuilder.FACTORY_KINDS.map(async kind => {
                        try{
                            const factory = await node3dBuilder.getFactory(kind)
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
                            node3dShared,
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