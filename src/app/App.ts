import { CreateAudioEngineAsync, Vector3 } from "@babylonjs/core";
import { NetworkManager } from "../network/NetworkManager.ts";
import { InputManager } from "../xr/inputs/InputManager.ts";
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
import { PointerVisualSystem } from "./PointerVisualSystem.ts";
import { MenuSystem } from "./MenuSystem.ts";
import { ContextMenuSystem } from "./ContextMenuSystem.ts";
import { HapticContactSystem } from "./HapticContactSystem.ts";
import { TUTORIAL_KINDS } from "../tutorial/TutorialScenario.ts";
import { AudioWorldSystem } from "./AudioDestinationSystem.ts";
import { MicrophoneSystem } from "./MicrophoneSystem.ts";
import { VoiceChatSystem } from "./VoiceChatSystem.ts";

let _app: App

export class App {
    private static readonly DEBUG_LOG = false;
    private controlsUI?: ControlsUISystem;
    private wakeLock: any = null; // Screen wake lock to prevent device sleep

    constructor() {
        _app = this
    }

    private static instance?: App

    public static get(): App {
        if (!App.instance) throw new Error("NewApp not initialized. Create an instance first.")
        return App.instance;
    }

    public async start(
        participantId: string,
        roomName: string,
        doc: Doc,
        options: { tutorial?: boolean; onProgress?: (text: string, progress: number, detail?: string) => void } = {},
    ): Promise<void> {
        App.instance = this
        const startedAt = performance.now()
        const totalSteps = 13
        let currentStep = 0
        const report = (text: string, detail: string = '') => {
            currentStep += 1
            const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1)
            options.onProgress?.(text, Math.round((currentStep / totalSteps) * 100), detail || `elapsed ${elapsed}s`)
        }
        
        const username = RandomUtils.randomName()
        const usercolor = RandomUtils.randomColor()

        // Intialization of scene
        report("Preparing 3D scene")
        await SceneManager.initialize()


        // Initialization of Audio Context
        report("Preparing audio engine")
        const audioContext = new AudioContext()
        this.armAudioContextResume(audioContext)
        
        const audioEngine = await CreateAudioEngineAsync({audioContext})
        void audioEngine.unlockAsync().catch(e =>
            console.warn('[App] Audio engine unlock deferred until interaction:', e)
        )


        // Request wake lock and setup audio context state handling
        this.requestWakeLock()
        this.setupAudioContextStateHandling(audioContext)
        this.setupVisibilityHandling(audioContext)

        BabylonsJSFix.fix()

        report("Preparing XR runtime")
        UIManager.initialize()
        await XRManager.getInstance()!!.init(SceneManager.getInstance().getScene(), audioEngine);

        report("Preparing inputs")
        InputManager.create(XRManager.getInstance().xrHelper ?? null, [
            SceneManager.getInstance().getScene(),
            SceneManager.getInstance().getUtilityLayer().utilityLayerScene
        ])

        report("Preparing menus")
        await MenuSystem.initialize(
            SceneManager.getInstance(),
        )

        report("Preparing node graph")
        await Node3dManager.initialize(audioContext, audioEngine)
        
        PlayerManager.initialize(participantId)
        NetworkManager.initialize(participantId, roomName, doc)
        ConnectionManager.initialize()

        report("Preparing networking")
        await AppOrchestrator.initialize()

        SceneManager.getInstance().start()

        report("Preparing collaboration tools")
        await Promise.all([
            DrawingSystem.initialize(
                NetworkManager.getInstance(),
                InputManager.getInstance(),
                SceneManager.getInstance(),
                usercolor,
            ),
            AvatarSystem.initialize(
                NetworkManager.getInstance(),
                InputManager.getInstance(),
                SceneManager.getInstance(),
                NetworkEventBus.getInstance(),
                username,
                usercolor,
            ),
            ShopMenuSystem.initialize(
                SceneManager.getInstance(),
                InputManager.getInstance(),
                Node3dManager.getInstance(),
                MenuSystem.getInstance(),
                options.tutorial ? { allowedKinds: new Set(Object.values(TUTORIAL_KINDS)) } : {},
            ),
            TargetManager.initialize(
                SceneManager.getInstance(),
                InputManager.getInstance(),
                Node3dManager.getInstance(),
            ),
            PointerVisualSystem.initialize(
                SceneManager.getInstance(),
                InputManager.getInstance(),
            ),
            HapticContactSystem.initialize(
                InputManager.getInstance(),
            ),
            AudioWorldSystem.initialize(
                audioContext,
                InputManager.getInstance(),
            ),
        ])

        report("Preparing voice tools")
        MicrophoneSystem.initialize(audioContext)
        VoiceChatSystem.initialize(
            audioContext,
            NetworkManager.getInstance(),
            AvatarSystem.getInstance(),
            SceneManager.getInstance(),
        )

        report("Preparing hand controls")
        await Promise.all([
            HandMenuSystem.initialize(
                SceneManager.getInstance(),
                InputManager.getInstance(),
                WamTransportManager.getInstance(audioContext),
                Node3dManager.getInstance(),
                ShopMenuSystem.getInstance(),
            ),
            ContextMenuSystem.initialize(
                SceneManager.getInstance(),
                InputManager.getInstance(),
                WamTransportManager.getInstance(audioContext),
                Node3dManager.getInstance(),
                TargetManager.getInstance(),
                MenuSystem.getInstance(),
            ),
        ])

        // Get things
        const scene = SceneManager.getInstance().getScene()
        const node3dManager = Node3dManager.getInstance()
        const node3dBuilder = node3dManager.builder
        const node3dShared = node3dBuilder.getShared()
        
        // create 3D controller button labels
        report("Preparing controller hints")
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
                await SceneManager.getInstance().toggleInspector()
            }
            else if(e.key=="o"){
                NetworkManager.getInstance().doc
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

        MenuSystem.getInstance().showMessage("Welcome to the Musical Multiverse VR!", "white")
        report("Session scene ready")

    }

    private armAudioContextResume(audioContext: AudioContext): void {
        const resume = async () => {
            if (audioContext.state === 'running') return
            try {
                await audioContext.resume()
                cleanup()
                console.log('[App] AudioContext resumed after user interaction')
            } catch (e) {
                console.warn('[App] AudioContext resume deferred:', e)
            }
        }
        const cleanup = () => {
            window.removeEventListener('pointerdown', resume)
            window.removeEventListener('touchend', resume)
            window.removeEventListener('keydown', resume)
        }

        window.addEventListener('pointerdown', resume, { passive: true })
        window.addEventListener('touchend', resume, { passive: true })
        window.addEventListener('keydown', resume)
        void resume()
    }

    /**
     * Request screen wake lock to prevent device sleep during session.
=     */
    private async requestWakeLock(): Promise<void> {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await (navigator as any).wakeLock.request('screen');
                console.log('[App] Screen wake lock acquired - device will stay awake');
            } catch (err) {
                console.warn('[App] Wake lock request failed:', err);
            }
        } else {
            console.warn('[App] Screen Wake Lock API not supported on this browser');
        }
    }

    /**
     * Handle AudioContext state changes and auto-resume when suspended.
     */
    private setupAudioContextStateHandling(audioContext: AudioContext): void {
        audioContext.addEventListener('statechange', () => {
            console.log(`[App] AudioContext state changed to: ${audioContext.state}`);
            
            if (audioContext.state === 'suspended') {
                console.warn('[App] AudioContext suspended - attempting to resume');
                audioContext.resume().catch(e => 
                    console.error('[App] Failed to resume AudioContext:', e)
                );
            }
        });
    }

    /**
     * Handle document visibility changes (headset sleep/wake).
     * Resume AudioContext when document becomes visible again.
     */
    private setupVisibilityHandling(audioContext: AudioContext): void {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('[App] Document hidden (headset/tab backgrounded)');
                // AudioContext will auto-suspend; will resume when visible again
            } else {
                console.log('[App] Document visible (headset/tab foregrounded)');
                // Attempt to resume AudioContext
                if (audioContext.state === 'suspended') {
                    console.log('[App] Resuming AudioContext on visibility');
                    audioContext.resume().catch(e => 
                        console.error('[App] Failed to resume on visibility change:', e)
                    );
                }
            }
        });
    }

}
