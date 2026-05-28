import { CreateAudioEngineAsync, Vector3 } from "@babylonjs/core";
import { NetworkManager } from "../network/NetworkManager.ts";
import { InputManager } from "../xr/inputs/InputManager.ts";
import { InputVisualPointer } from "../xr/inputs/tools/InputVisualPointer.ts";
import { XRManager } from "../xr/XRManager.ts";
import { AppOrchestrator } from "./AppOrchestrator.ts";
import { ConnectionManager } from "./ConnectionManager.ts";
import ControlsUISystem from "./ControlsUISystem.ts";
import { Node3dManager } from "./Node3dManager.ts";
import { PlayerManager } from "./PlayerManager.ts";
import { SceneManager } from "./SceneManager.ts";
import { Serialization } from "./Serialization.ts";
import { UIManager } from "./UIManager.ts";
import { DrawingSystem } from "./DrawingSystem.ts";
import { AvatarSystem } from "./AvatarSystem.ts";
import { NetworkEventBus } from "../eventBus/NetworkEventBus.ts";
import { RandomUtils } from "../node3d/tools/utils/RandomUtils.ts";
import { Doc } from "yjs";
import { HandMenuSystem } from "./HandMenuSystem.ts";
import { WamTransportManager } from "./WamTransportManager.ts";
import { ShopMenuSystem } from "./ShopMenuSystem.ts";
import { TargetManager } from "./TargetManager.ts";
import { BabylonsJSFix } from "./BabylonsJSFix.ts";

let _app: App

export class App {
    private static readonly DEBUG_LOG = false;
    private controlsUI?: ControlsUISystem;

    constructor() {
        _app = this
    }

    private static instance?: App

    public static get(): App {
        if (!App.instance) throw new Error("NewApp not initialized. Create an instance first.")
        return App.instance;
    }

    public async start(participantId: string, roomName: string, doc: Doc): Promise<void> {
        App.instance = this
        
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

        BabylonsJSFix.fix()

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

        await DrawingSystem.initialize(
            NetworkManager.getInstance(),
            InputManager.getInstance(),
            SceneManager.getInstance(),
            usercolor,
        )

        await AvatarSystem.initialize(
            NetworkManager.getInstance(),
            InputManager.getInstance(),
            SceneManager.getInstance(),
            NetworkEventBus.getInstance(),
            username,
            usercolor,
        )

        await ShopMenuSystem.initialize(
            SceneManager.getInstance(),
            InputManager.getInstance(),
            Node3dManager.getInstance(),
        )

        await TargetManager.initialize(
            SceneManager.getInstance(),
            InputManager.getInstance(),
            Node3dManager.getInstance(),
        )

        await HandMenuSystem.initialize(
            SceneManager.getInstance(),
            InputManager.getInstance(),
            WamTransportManager.getInstance(audioContext),
            Node3dManager.getInstance(),
            ShopMenuSystem.getInstance(),
            TargetManager.getInstance(),
        )

        

        // Get things
        const scene = SceneManager.getInstance().getScene()
        const node3dManager = Node3dManager.getInstance()
        const node3dBuilder = node3dManager.builder
        const node3dShared = node3dBuilder.getShared()
        
        // create 3D controller button labels
        this.controlsUI = new ControlsUISystem();
        
        // Setup X button to toggle controls UI
        InputManager.getInstance().x_button.onChange.add((event) => {
            if (event.pressed) {
                this.controlsUI?.toggle();
            }
        });

        if (App.DEBUG_LOG) console.log(node3dShared)

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

        /*const menu = new MenuPanel(scene, SceneManager.getInstance().getUtilityLayer().utilityLayerScene, [
            { label: "🞡 Add", color: "#66ff66", onClick: ()=>{} },
            { label: "🗐 Copy", color: "#FFFF66", onClick: ()=>{} },
            { label: "✎ Edit", color: "#6699FF", onClick: ()=>{} },
            { label: "🔗 Connect", color: "#66FFFF", onClick: ()=>{} },
            { label: "📁 Save", color: "#FF66FF", onClick: ()=>{} },
            { label: "📂 Load", color: "#FF9966", onClick: ()=>{} },
            { label: "❌ Remove", color: "#FF6666", onClick: ()=>{} }
        ])
        menu.followPointer(InputManager.getInstance().left.pointer)
        menu.show()*/

        //// POINTERS ////
        InputVisualPointer.CreateSimple(scene, InputManager.getInstance().left.pointer)
        InputVisualPointer.CreateSimple(scene, InputManager.getInstance().right.pointer)

    }

}