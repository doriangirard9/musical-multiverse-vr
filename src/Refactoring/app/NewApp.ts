import { CreateAudioEngineAsync, Vector3 } from "@babylonjs/core";
import { NetworkManager } from "../network/NetworkManager.ts";
import { ShopPanel } from "../world/menu/ShopPanel.ts";
import { InputManager } from "../xr/inputs/InputManager.ts";
import { InputVisualPointer } from "../xr/inputs/tools/InputVisualPointer.ts";
import { XRManager } from "../xr/XRManager.ts";
import { AppOrchestrator } from "./AppOrchestrator.ts";
import { ConnectionManager } from "./ConnectionManager.ts";
import ControlsUI from "./ControlsUI.ts";
import { Node3dManager } from "./Node3dManager.ts";
import { PlayerManager } from "./PlayerManager.ts";
import { SceneManager } from "./SceneManager.ts";
import { Serialization } from "./Serialization.ts";
import { UIManager } from "./UIManager.ts";
import { DrawingManager } from "./DrawingManager.ts";
import { AvatarManager } from "./AvatarManager.ts";
import { NetworkEventBus } from "../eventBus/NetworkEventBus.ts";
import { RandomUtils } from "../node3d/tools/utils/RandomUtils.ts";
import { Doc } from "yjs";
import { N3DPreviewer } from "../world/N3DPreviewer.ts";
export class NewApp {
    private static readonly DEBUG_LOG = false;
    private controlsUI?: ControlsUI;

    constructor() {}


    private static instance?: NewApp

    public static get(): NewApp {
        if (!NewApp.instance) throw new Error("NewApp not initialized. Create an instance first.")
        return NewApp.instance;
    }

    public async start(participantId: string, roomName: string, doc: Doc): Promise<void> {
        NewApp.instance = this
        
        const username = RandomUtils.randomName()
        const usercolor = RandomUtils.randomColor()

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
        await XRManager.getInstance()!!.init(SceneManager.getInstance().getScene(), audioEngine);

        InputManager.create(XRManager.getInstance().xrHelper, [
            SceneManager.getInstance().getScene(),
            SceneManager.getInstance().getUtilityLayer().utilityLayerScene
        ])

        await Node3dManager.initialize(audioContext, audioEngine)
        
        PlayerManager.initialize(participantId)
        NetworkManager.initialize(participantId, roomName, doc)
        ConnectionManager.initialize()

        await AppOrchestrator.initialize()

        SceneManager.getInstance().start()

        await DrawingManager.initialize(
            NetworkManager.getInstance(),
            InputManager.getInstance(),
            SceneManager.getInstance(),
            usercolor,
        )

        await AvatarManager.initialize(
            NetworkManager.getInstance(),
            InputManager.getInstance(),
            SceneManager.getInstance(),
            NetworkEventBus.getInstance(),
            username,
            usercolor,
        )

        

        // Get things
        const scene = SceneManager.getInstance().getScene()
        const node3dManager = Node3dManager.getInstance()
        const node3dBuilder = node3dManager.builder
        const node3dShared = node3dBuilder.getShared()
        
        // create 3D controller button labels
        this.controlsUI = new ControlsUI();
        
        // Setup X button to toggle controls UI
        InputManager.getInstance().x_button.onChange.add((event) => {
            if (event.pressed) {
                this.controlsUI?.toggle();
            }
        });

        if (NewApp.DEBUG_LOG) console.log(node3dShared)

        window.addEventListener("keydown",async(e)=>{
            if(e.key=="p"){
                let prompt = window.prompt("Enter Node3D kind to create:")
                if(prompt) node3dManager.addNode3d(`${prompt}`, new Vector3(0,0,5))
            }
            else if(e.key=="i"){
                scene.debugLayer.show()
            }
            // else if(e.key=="q"){
            //     let prompt = window.prompt("Enter URL to import:")
            //     let factory = (await node3dManager.builder.getFactory(prompt||""))!!

            //     const texture = await N3DRendering.renderThumbnail(
            //         SceneManager.getInstance().getScene(),
            //         factory,
            //         512
            //     )
                
            //     const url = await N3DRendering.textureToImageURL(texture)
            //     const a = document.createElement('a')
            //     a.href = url
            //     a.download = `${factory.label}.png` 
            //     a.click()
            // }
            else if(e.key=="l"){
                const state = PlayerManager.getInstance().getPlayerState()!.position
                const position = new Vector3(state.x, state.y, state.z)
                
                let nearest = [...NetworkManager.getInstance().node3d.nodes.entries()]
                    .map(it=>it[1])
                    .reduceRight((a,b)=>{
                        const ad = Vector3.DistanceSquared(a.boundingBoxMesh.position, position)
                        const bd = Vector3.DistanceSquared(b.boundingBoxMesh.position, position)
                        return ad<bd?a:b
                    })

                const serialized = Serialization.getInstance().save([nearest])

                localStorage.setItem("saved",JSON.stringify(serialized))
                console.log("Saved", JSON.stringify(serialized))
                alert("Saved")
            }
            else if(e.key=="m"){
                const str = localStorage.getItem("saved"); if(!str) return
                const serialized = JSON.parse(str)
                await Serialization.getInstance().load(serialized)
            }
            else if(e.key=="c"){
                InputManager.getInstance().movement.stackEnable()
            }
            else if(e.key=="v"){
                InputManager.getInstance().movement.stackDisable()
            }
        })

        let shopPanel: ShopPanel
        InputManager.getInstance().a_button.onDown.add(()=>{
            if(!shopPanel){
                shopPanel = new ShopPanel(scene, SceneManager.getInstance().getUtilityLayer().utilityLayerScene)
                shopPanel.makeFollow()
            }
            else shopPanel.toggle()
        })

        //// POINTERS ////
        InputVisualPointer.CreateSimple(scene, InputManager.getInstance().left.pointer)
        InputVisualPointer.CreateSimple(scene, InputManager.getInstance().right.pointer)

    }

}