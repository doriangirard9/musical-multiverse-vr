import { Node3DInstance } from "../node3d/instance/Node3DInstance.ts";
import { Node3D, Node3DFactory, Node3DGUI } from "../node3d/Node3D.ts";
import { OscillatorN3DFactory } from "../node3d/subs/OscillatorN3D.ts";
import { Node3dManager } from "./Node3dManager.ts";
import { SceneManager } from "./SceneManager.ts";
import { WamInitializer } from "./WamInitializer.ts";
import { WAMGuiInitCode, examples } from "wam3dgenerator";
import { Wam3DGeneratorN3DFactory } from "../node3d/subs/Wam3DGeneratorN3D.ts";
import { N3DShared } from "../node3d/instance/N3DShared.ts";
import { MaracasN3DFactory } from "../node3d/subs/maracas/MaracasN3D.ts";
import { NoteBoxN3DFactory } from "../node3d/subs/NoteBoxN3D.ts";
import { SpeakerN3DFactory } from "../node3d/subs/speaker/SpeakerN3D.ts";
import { PianoRollN3DFactory } from "../node3d/subs/PianoRoll/PianoRoll3d.ts";
import { DrumKitN3DFactory } from "../node3d/subs/drumkit/DrumKitN3D.ts";
import { ButterchurnN3DFactory } from "../node3d/subs/video/ButterchurnN3D.ts";
import { IsfShaderN3DFactory } from "../node3d/subs/video/IsfShaderN3D.ts";
import { ScreenN3DFactory } from "../node3d/subs/video/ScreenN3D.ts";
import { BoxScreenN3DFactory } from "../node3d/subs/video/BoxScreenN3D.ts";
import { SphereScreenN3DFactory } from "../node3d/subs/video/SphereScreenN3D.ts";
import { CylinderScreenN3DFactory } from "../node3d/subs/video/CylinderScreenN3D.ts";
import { SpectrumBarsN3DFactory } from "../node3d/subs/visualizer/SpectrumBarsN3D.ts";
import { OscilloscopeN3DFactory } from "../node3d/subs/visualizer/OscilloscopeN3D.ts";
import { SpectogramN3DFactory } from "../node3d/subs/visualizer/SpectogramN3D.ts";
import { LiveGainN3DFactory } from "../node3d/subs/visualizer/LiveGainN3D.ts";
import { LivePianoN3DFactory } from "../node3d/subs/note_generator/LivePianoN3D.ts";
import { HyperKeyboardN3DFactory } from "../node3d/subs/note_generator/HyperKeyboardN3D.ts";
import { DrumPlateKitN3DFactory } from "../node3d/subs/note_generator/DrumPlateKitN3D.ts";
import { AutomationControllerN3DFactory } from "../node3d/subs/automation/AutomationControllerN3D.ts";
import { PositionCubeN3DFactory } from "../node3d/subs/automation/PositionCubeN3D.ts";
import { HarpN3DFactory } from "../node3d/subs/note_generator/HarpN3D.ts";
import { GazeControllerN3DFactory } from "../node3d/subs/automation/GazeControllerN3D.ts";
import { VoiceVolumeControllerN3DFactory } from "../node3d/subs/automation/VoiceVolumeControllerN3D.ts";
import { SyncDebugN3DFactory } from "../node3d/subs/debug/SyncDebugN3D.ts";
import { AbstractMesh, CreatePlane, Vector4, VertexBuffer } from "@babylonjs/core";
import { TextureAtlas } from "../utils/atlas.ts";
import { AutoDispose } from "../utils/auto_dispose.ts";
import { AudioPlaqueN3DFactory } from "../node3d/subs/behaviours/AudioPlaqueN3D.ts";
import { SuperformulaN3DFactory } from "../node3d/subs/behaviours/SuperformulaN3D.ts";
import { Superformula3DN3DFactory } from "../node3d/subs/behaviours/Superformula3DN3D.ts";
import { FluidFieldN3DFactory } from "../node3d/subs/behaviours/FluidFieldN3D.ts";
import { RainPlinkoN3DFactory } from "../node3d/subs/behaviours/RainPlinkoN3D.ts";
import { AIComposerN3DFactory } from "../node3d/subs/ai/AIComposerN3D.ts";
import { NeuralDrumMachineN3DFactory } from "../node3d/subs/ai/NeuralDrumMachineN3D.ts";
import ParticleEmitterN3DFactory from "../node3d/subs/particle/ParticleEmitterN3D.ts";
import { N3DThumbnailRenderer } from "../world/renderer/N3DThumbnailRenderer.ts";
import { SERVER_NAME } from "../options.ts";
import { Sequencer12N3DFactory, Sequencer16N3DFactory } from "../node3d/subs/SequencerN3D.ts";

export type Node3DConfig = { name: string, wam3d: WAMGuiInitCode }

const SERVER_KINDS: string[] = await fetch(`${SERVER_NAME}/api/configs/`).then(r => r.json())

/**
 * The Node3DBuilder is responsible for creating Node3D instances from their kind name.
 * It map a kind name to a Node3DFactory.
 * 
 * **To add a new Node3D**:
 * - The list of every factory kinds is {@link FACTORY_KINDS}.
 * - The function that associate a kind name to a factory is {@link createFactories}.
 * 
 * **To get a Node3D**:
 * - To get a Node3DFactory from a kind name is {@link getFactory}.
 * - To create a Node3D from a kind name is {@link create}.
 * - To get a thumbnail of a Node3D from a kind name is {@link getThumbnail}.
 * - to create an impostor of a Node3D from a kind name is {@link createImpostor}.
 * 
 * Do not call directly {@link create} to create a Node3D in the shared world, use {@link Node3dManager.addNode3d} instead, which will handle the network synchronization and loading. 
 */
export class Node3DBuilder {

    /**
     * Some of the valid kinds of Node3D.
     */
    FACTORY_KINDS = [
        "audiooutput", "oscillator", "maracas", "livepiano", "notesbox", "pianoroll", "drumkit", "pro54michel", "butterchurn", "screen", "box_screen", "sphere_screen", "cylinder_screen", "isf_shader", "spectrum_bars", "oscilloscope", "spectogram", "livegain",
        "hyperkeyboard", "drumplatekit", "automation_controller", "the_cube", "harp", "large_harp", "voice", "gaze", "sequencer12", "sequencer16", "audio_plaque", "superformula", "superformula3d", "fluid_field", "rain_plinko", "ai_composer", "ai_composer_improv", "ai_composer_drums", "ai_composer_basic", "ai_composer_vae", "neural_drum_machine",
        ...Object.keys(examples).map(k => `wam3d-${k}`),
        ...SERVER_KINDS.map(k => `server-${k}`),
    ]

    /** Parse a imported code into a node3DFactory */
    private async parseFactory(code: string): Promise<Node3DFactory<Node3DGUI, Node3D> | null> {
        const json = JSON.parse(code) as Node3DConfig

        if ("controls" in json && "wam_url" in json) {
            return await Wam3DGeneratorN3DFactory.create(json as any)
        }

        return null
    }

    private async createFactories(kind: string): Promise<Node3DFactory<Node3DGUI, Node3D> | null> {
        if (!kind || kind.trim() === "") return null;

        // Dynamic with the code as kind
        if (kind.startsWith("desc:")) {
            const description = kind.substring(5)
            return await this.parseFactory(description)
        }

        if(kind.startsWith("{")){
            return await this.parseFactory(kind)
        }

        // Dynamic from an url
        if (kind.startsWith("external:")) {
            const url = new URL(kind.substring("external:".length))
            const anchor = url.hash.length > 1 ? url.hash.substring(1) : null
            const imported = (await import(url.href))

            let factory
            if (anchor) factory = imported[anchor]
            else factory = imported.default

            if (!("create" in factory && "createGUI" in factory && "label" in factory)) return null
            return factory
        }

        // From server
        if (kind.startsWith("server-")) {
            const config_id = kind.substring("server-".length)
            if (!config_id || config_id.trim() === "") return null
            try {
                const response = await fetch(`${SERVER_NAME}/api/configs/${config_id}`)
                if (!response.ok) return null
                return await this.parseFactory(await response.text())
            } catch (e) {
                console.error(`Error fetching Node3D config from server for kind ${kind}:`, e)
                return null
            }
        }

        // Builtin
        if (kind == "audio_plaque") return AudioPlaqueN3DFactory.DEFAULT;
        if (kind == "superformula") return SuperformulaN3DFactory.DEFAULT;
        if (kind == "superformula3d") return Superformula3DN3DFactory.DEFAULT;
        if (kind == "fluid_field") return FluidFieldN3DFactory.DEFAULT;
        if (kind == "rain_plinko") return RainPlinkoN3DFactory.DEFAULT;
        if (kind == "ai_composer") return AIComposerN3DFactory.MELODY;
        if (kind == "ai_composer_improv") return AIComposerN3DFactory.IMPROV;
        if (kind == "ai_composer_drums") return AIComposerN3DFactory.DRUMS;
        if (kind == "ai_composer_basic") return AIComposerN3DFactory.BASIC;
        if (kind == "ai_composer_vae") return AIComposerN3DFactory.VAE;
        if (kind == "neural_drum_machine") return NeuralDrumMachineN3DFactory;
        if (kind == "audiooutput") return SpeakerN3DFactory
        if (kind == "sequencer" || kind == "sequencer12") return Sequencer12N3DFactory
        if (kind == "sequencer16") return Sequencer16N3DFactory
        if (kind == "oscillator") return OscillatorN3DFactory
        if (kind == "maracas") return MaracasN3DFactory
        if (kind == "livepiano") return LivePianoN3DFactory
        if (kind == "notesbox") return NoteBoxN3DFactory
        if (kind == "pianoroll") return PianoRollN3DFactory
        if (kind == "drumkit") return DrumKitN3DFactory
        if (kind == "butterchurn") return ButterchurnN3DFactory
        if (kind == "isf_shader") return IsfShaderN3DFactory
        if (kind == "screen") return ScreenN3DFactory
        if (kind == "box_screen") return BoxScreenN3DFactory
        if (kind == "sphere_screen") return SphereScreenN3DFactory
        if (kind == "cylinder_screen") return CylinderScreenN3DFactory
        if (kind == "spectrum_bars") return SpectrumBarsN3DFactory
        if (kind == "oscilloscope")  return OscilloscopeN3DFactory
        if (kind == "spectogram")    return SpectogramN3DFactory
        if (kind == "livegain")      return LiveGainN3DFactory
        if (kind == "hyperkeyboard") return HyperKeyboardN3DFactory.SIMPLE
        if (kind == "drumplatekit") return DrumPlateKitN3DFactory.SMALL
        if (kind == "automation_controller") return AutomationControllerN3DFactory
        if (kind == "the_cube") return PositionCubeN3DFactory.DEFAULT
        if (kind == "harp") return HarpN3DFactory.DEFAULT
        if (kind == "large_harp") return HarpN3DFactory.LARGE
        if (kind == "gaze") return GazeControllerN3DFactory
        if (kind == "voice") return VoiceVolumeControllerN3DFactory
        if (kind == "particle") return ParticleEmitterN3DFactory

        // Debug
        if (kind == "sync_debug") return SyncDebugN3DFactory

        // Wam3DGenerator examples
        if (kind.startsWith("wam3d-")) {
            const config = (examples as Record<string, WAMGuiInitCode>)[kind.substring(6)]
            if (!config) return null

            // TODO: SUPPRIMER CA, on peut pas mettre du scotch DANS le code parce qu'un
            // node3d est mal implémenté.
            if (kind === "wam3d-Drum") {
                return await Wam3DGeneratorN3DFactory.create({
                    ...config,
                    name: "Drum",
                    description: "Drum sampler controlled by MIDI.",
                    tags: ["audio", "midi", "instrument", "drum"],
                } as WAMGuiInitCode)
            }
            return await Wam3DGeneratorN3DFactory.create(config)
        }

        // Direct URL
        if (kind.startsWith("url:")) {
            const url = kind.substring(4)
            return await Wam3DGeneratorN3DFactory.create({ wam_url: url } as any)
        }

        return null
    }

    private presets = new Map<string, Promise<Record<string,Record<string,number>>>>()

    /**
     * Get a preset map for a given kind of Node3D. The preset is fetched and cached on the first call.
     * @param kind The kind of Node3D
     * @returns The preset map or null if the preset could not be fetched
     */
    public getPresets(kind: string): Promise<Record<string,Record<string,number>>>{
        if (!kind || kind.trim() === "" || kind.length > 20_000) return Promise.resolve({})
        if(!this.presets.has(kind)){
            return (async()=>{
                try{
                    const content = await fetch(`${SERVER_NAME}/api/presets/${kind}`)
                    const json = await content.json()
                    return json
                }catch(_){
                    this.presets.delete(kind)
                    return {}
                }
            })()
        }
        else return this.presets.get(kind)!
    }

    private factories = new Map<string, Promise<Node3DFactory<Node3DGUI, Node3D> | null>>()

    /**
     * Get a Node3DFactory from it kind name.
     * @param kind The kind of Node3D, correspond to the name of its config file.
     * @returns
     */
    public getFactory(kind: string): Promise<Node3DFactory<Node3DGUI, Node3D> | null> {
        if (!kind || kind.trim() === "" || kind.length > 20_000) return Promise.resolve(null)

        if (!this.factories.has(kind)) {
            const promise = (async () => {
                const factory = await this.createFactories(kind)
                if (!factory) this.factories.delete(kind)
                return factory
            })()
            this.factories.set(kind, promise)
        }
        return this.factories.get(kind)!
    }

    /**
     * Create a Node3D from a kind name and a configuration
     * The Node3D is not added to the world, it should be added before being used.
     * To add a Node3D to the world, use {@link Node3dManager.addNode3d} instead, which will handle the network synchronization and loading.
     * @param id The id of the Node3D, unique for every Node3D
     * @param kind The kind of Node3D, correspond to the name of its config file.
     * @returns The new Node3D or a description of the error
     */
    public async create(kind: string): Promise<Node3DInstance | string> {
        const factory = await this.getFactory(kind)
        if (factory == null) return `AudioNode3d of type ${kind} does not exists`

        return await this.instantiateNode3d(factory)
    }

    private renderer = new AutoDispose(
        async () => await new N3DThumbnailRenderer(SceneManager.getInstance().getScene(), 128, 3).initialize(),
        async (renderer) => renderer.dispose(),
        5_000
    )

    private thumbnails = {} as Record<string, Promise<{ url: string, uv: Vector4 } | null>>
    readonly atlas = new TextureAtlas("thumbnails", SceneManager.getInstance().getScene(), 128, 2048)

    /**
     * Get a thumbnail image url for a given kind of Node3D. The thumbnail is generated and cached on the first call.
     * It can block the main thread, so it should be used with care. 
     * @param kind The kind of Node3D
     * @returns Return the thumbnail image url 
     */
    public async getThumbnail(kind: string): Promise<{ url: string, uv: Vector4 } | null> {
        const saved = this.thumbnails[kind]
        if (saved) return saved

        const created = (async () => {
            try {
                const factory = await this.getFactory(kind)
                if (!factory) return null

                const renderer = await this.renderer.get()
                const url = await renderer.render(factory)

                const uv = await this.atlas.add(url)
                return { url, uv }
            } catch (e) {
                console.error(`Error generating thumbnail for kind ${kind}:`, e)
                return null
            }
        })()
        this.thumbnails[kind] = created
        return created
    }

    /**
     * Create an impostor of a Node3D kind. An impostor is a simple billboard plane with the thumbnail of the Node3D, used for lightweight rendering.
     * @param kind The kind of Node3D to create the impostor of 
     * @returns The impostor mesh or null if the thumbnail could not be generated
     */
    public async createImpostor(kind: string): Promise<AbstractMesh | null> {
        const uv = (await this.getThumbnail(kind))?.uv
        if (!uv) return null

        const billboard = CreatePlane("atlasTester", { size: 1 }, SceneManager.getInstance().getScene())
        billboard.setVerticesData(VertexBuffer.UVKind, [uv.x, uv.y, uv.z, uv.y, uv.z, uv.w, uv.x, uv.w])
        billboard.billboardMode = AbstractMesh.BILLBOARDMODE_ALL
        billboard.material = this.atlas.material

        return billboard
    }


    private shared: N3DShared | null = null

    public getShared(): N3DShared {
        if (this.shared == null) {
            throw new Error("Node3DBuilder not initialized. Call init() before using getShared().")
        }
        return this.shared
    }

    public async initialize(): Promise<void> {

        this.shared = new N3DShared(
            SceneManager.getInstance().getScene(),
            SceneManager.getInstance().getUtilityLayer(),
            SceneManager.getInstance().getShadowGenerator(),
            Node3dManager.getInstance().getAudioContext(),
            Node3dManager.getInstance().getAudioEngine(),
            (await WamInitializer.getInstance(Node3dManager.getInstance().getAudioContext()).getHostGroupId())[0]
        )

    }

    private async instantiateNode3d(factory: Node3DFactory<any, any>): Promise<Node3DInstance> {
        const instance = new Node3DInstance(this.getShared(), factory)
        await instance.instantiate()
        return instance
    }
}
