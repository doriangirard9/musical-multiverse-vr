import { Node3DInstance } from "../node3d/instance/Node3DInstance.ts";
import { Node3D, Node3DFactory, Node3DGUI } from "../node3d/Node3D.ts";
import { Node3dManager } from "./Node3dManager.ts";
import { SceneManager } from "./SceneManager.ts";
import { WamInitializer } from "./WamInitializer.ts";
import type { WAMGuiInitCode } from "wam3dgenerator";
import { N3DShared } from "../node3d/instance/N3DShared.ts";
import { AbstractMesh, CreatePlane, Vector4, VertexBuffer } from "@babylonjs/core";
import { TextureAtlas } from "../utils/atlas.ts";
import { AutoDispose } from "../utils/auto_dispose.ts";
import { N3DThumbnailRenderer } from "../world/renderer/N3DThumbnailRenderer.ts";
import { SERVER_NAME } from "../options.ts";

export type Node3DConfig = { name: string, wam3d: WAMGuiInitCode }
export type Node3DCatalogEntry = { kind: string; label: string; description: string; tags: string[] }

const BUILTIN_CATALOG_ENTRIES: Record<string, Omit<Node3DCatalogEntry, "kind">> = {
    audiooutput: { label: "Speaker", description: "Audio output destination.", tags: ["audio", "output"] },
    oscillator: { label: "Oscillator", description: "Basic audio generator.", tags: ["audio", "generator"] },
    maracas: { label: "Maracas", description: "Shake instrument.", tags: ["audio", "instrument"] },
    livepiano: { label: "Live Piano", description: "Playable MIDI keyboard.", tags: ["midi", "controller"] },
    notesbox: { label: "Notes Box", description: "MIDI note utility.", tags: ["midi", "utility"] },
    pianoroll: { label: "Piano Roll", description: "Step-based MIDI editor.", tags: ["midi", "sequencer"] },
    drumkit: { label: "Drum Kit", description: "Interactive XR drumkit with MIDI output.", tags: ["midi", "instrument", "drum"] },
    sequencer: { label: "Sequencer 12", description: "12-step sequencer.", tags: ["midi", "sequencer"] },
    sequencer12: { label: "Sequencer 12", description: "12-step sequencer.", tags: ["midi", "sequencer"] },
    sequencer16: { label: "Sequencer 16", description: "16-step sequencer.", tags: ["midi", "sequencer"] },
    hyperkeyboard: { label: "Hyper Keyboard", description: "Extended MIDI keyboard.", tags: ["midi", "controller"] },
    drumplatekit: { label: "Drum Plate Kit", description: "Percussive MIDI trigger plates.", tags: ["midi", "controller", "drum"] },
    automation_controller: { label: "Automation Controller", description: "Automation source for parameters.", tags: ["automation", "controller"] },
    the_cube: { label: "The Cube", description: "Spatial automation cube.", tags: ["automation", "controller"] },
    harp: { label: "Harp", description: "Playable harp controller.", tags: ["midi", "controller"] },
    large_harp: { label: "Large Harp", description: "Large-format playable harp.", tags: ["midi", "controller"] },
    gaze: { label: "Gaze Controller", description: "Automation driven by gaze.", tags: ["automation", "controller"] },
    voice: { label: "Voice Volume", description: "Voice-driven automation controller.", tags: ["automation", "voice"] },
    audio_plaque: { label: "Audio Plaque", description: "Audio-reactive plaque behavior.", tags: ["audio", "visual"] },
    superformula: { label: "Superformula", description: "Generative shape controller.", tags: ["visual", "generator"] },
    superformula3d: { label: "Superformula 3D", description: "3D generative shape controller.", tags: ["visual", "generator"] },
    fluid_field: { label: "Fluid Field", description: "Fluid-based visual behavior.", tags: ["visual", "generator"] },
    particle: { label: "Particle Emitter", description: "Particle visual emitter.", tags: ["visual", "generator"] },
    sync_debug: { label: "Sync Debug", description: "Synchronization debugging tool.", tags: ["debug"] },
};

const BUILTIN_FACTORY_LOADERS: Record<string, () => Promise<Node3DFactory<Node3DGUI, Node3D>>> = {
    audiooutput: async () => (await import("../node3d/subs/speaker/SpeakerN3D.ts")).SpeakerN3DFactory,
    oscillator: async () => (await import("../node3d/subs/OscillatorN3D.ts")).OscillatorN3DFactory,
    maracas: async () => (await import("../node3d/subs/maracas/MaracasN3D.ts")).MaracasN3DFactory,
    livepiano: async () => (await import("../node3d/subs/note_generator/LivePianoN3D.ts")).LivePianoN3DFactory,
    notesbox: async () => (await import("../node3d/subs/NoteBoxN3D.ts")).NoteBoxN3DFactory,
    pianoroll: async () => (await import("../node3d/subs/PianoRoll/PianoRoll3d.ts")).PianoRollN3DFactory,
    drumkit: async () => (await import("../node3d/subs/drumkit/DrumKitN3D.ts")).DrumKitN3DFactory,
    sequencer: async () => (await import("../node3d/subs/SequencerN3D.ts")).Sequencer12N3DFactory,
    sequencer12: async () => (await import("../node3d/subs/SequencerN3D.ts")).Sequencer12N3DFactory,
    sequencer16: async () => (await import("../node3d/subs/SequencerN3D.ts")).Sequencer16N3DFactory,
    hyperkeyboard: async () => (await import("../node3d/subs/note_generator/HyperKeyboardN3D.ts")).HyperKeyboardN3DFactory.SIMPLE,
    drumplatekit: async () => (await import("../node3d/subs/note_generator/DrumPlateKitN3D.ts")).DrumPlateKitN3DFactory.SMALL,
    automation_controller: async () => (await import("../node3d/subs/automation/AutomationControllerN3D.ts")).AutomationControllerN3DFactory,
    the_cube: async () => (await import("../node3d/subs/automation/PositionCubeN3D.ts")).PositionCubeN3DFactory.DEFAULT,
    harp: async () => (await import("../node3d/subs/note_generator/HarpN3D.ts")).HarpN3DFactory.DEFAULT,
    large_harp: async () => (await import("../node3d/subs/note_generator/HarpN3D.ts")).HarpN3DFactory.LARGE,
    gaze: async () => (await import("../node3d/subs/automation/GazeControllerN3D.ts")).GazeControllerN3DFactory,
    voice: async () => (await import("../node3d/subs/automation/VoiceVolumeControllerN3D.ts")).VoiceVolumeControllerN3DFactory,
    audio_plaque: async () => (await import("../node3d/subs/behaviours/AudioPlaqueN3D.ts")).AudioPlaqueN3DFactory.DEFAULT,
    superformula: async () => (await import("../node3d/subs/behaviours/SuperformulaN3D.ts")).SuperformulaN3DFactory.DEFAULT,
    superformula3d: async () => (await import("../node3d/subs/behaviours/Superformula3DN3D.ts")).Superformula3DN3DFactory.DEFAULT,
    fluid_field: async () => (await import("../node3d/subs/behaviours/FluidFieldN3D.ts")).FluidFieldN3DFactory.DEFAULT,
    particle: async () => (await import("../node3d/subs/particle/ParticleEmitterN3D.ts")).default,
    sync_debug: async () => (await import("../node3d/subs/debug/SyncDebugN3D.ts")).SyncDebugN3DFactory,
    spectrum_bars: async () => (await import("../node3d/subs/SpectrumBarsN3D.ts")).SpectrumBarsN3DFactory,
    oscilloscope: async () => (await import("../node3d/subs/OscilloscopeN3D.ts")).OscilloscopeN3DFactory,
    spectogram: async () => (await import("../node3d/subs/SpectogramN3D.ts")).SpectogramN3DFactory,
    livegain: async () => (await import("../node3d/subs/LiveGainN3D.ts")).LiveGainN3DFactory,
};

const SERVER_KINDS: string[] = await fetch(`${SERVER_NAME}/api/configs/`).then(r => r.json())
const WAM3D_EXAMPLE_NAMES = [
    "TS9 Overdrive", "Faust Flute", "Modal", "Distortion", "Smooth Delay", "Ping Pong Delay", "Vox Amp 30",
    "Faust VocalBP", "PitchShifter", "Blipper", "Owl Dirty", "Owl Shimmer", "QuadraFuzz",
    "Stone Phaser", "French Bell", "Marimba", "Clarinet", "Synth 101", "Kool Verb",
    "Nylon Guitar", "Micro 54", "Tiny Synth", "Random Note", "Drum",
]
const WAM3D_EXAMPLE_METADATA: Record<string, Omit<Node3DCatalogEntry, "kind">> = {
    "TS9 Overdrive": { label: "TS9 Overdrive", description: "Guitar overdrive effect.", tags: ["audio", "effect"] },
    "Faust Flute": { label: "Faust Flute", description: "MIDI flute instrument.", tags: ["audio", "midi", "instrument"] },
    "Modal": { label: "Modal", description: "MIDI modal synthesizer.", tags: ["audio", "midi", "instrument"] },
    "Distortion": { label: "Distortion", description: "Audio distortion effect.", tags: ["audio", "effect"] },
    "Smooth Delay": { label: "Smooth Delay", description: "Audio delay effect.", tags: ["audio", "effect"] },
    "Ping Pong Delay": { label: "Ping Pong Delay", description: "Stereo ping pong delay effect.", tags: ["audio", "effect"] },
    "Vox Amp 30": { label: "Vox Amp 30", description: "Guitar amp effect.", tags: ["audio", "effect"] },
    "Faust VocalBP": { label: "Faust VocalBP", description: "MIDI vocal instrument.", tags: ["audio", "midi", "instrument"] },
    "PitchShifter": { label: "PitchShifter", description: "Audio pitch shifting effect.", tags: ["audio", "effect"] },
    "Blipper": { label: "Blipper", description: "Audio generator.", tags: ["audio", "generator"] },
    "Owl Dirty": { label: "Owl Dirty", description: "Audio distortion effect.", tags: ["audio", "effect"] },
    "Owl Shimmer": { label: "Owl Shimmer", description: "Audio shimmer effect.", tags: ["audio", "effect"] },
    "QuadraFuzz": { label: "QuadraFuzz", description: "Audio fuzz effect.", tags: ["audio", "effect"] },
    "Stone Phaser": { label: "Stone Phaser", description: "Audio phaser effect.", tags: ["audio", "effect"] },
    "French Bell": { label: "French Bell", description: "MIDI bell instrument.", tags: ["audio", "midi", "instrument"] },
    "Marimba": { label: "Marimba", description: "MIDI marimba instrument.", tags: ["audio", "midi", "instrument"] },
    "Clarinet": { label: "Clarinet", description: "MIDI clarinet instrument.", tags: ["audio", "midi", "instrument"] },
    "Synth 101": { label: "Synth 101", description: "MIDI synthesizer.", tags: ["audio", "midi", "instrument"] },
    "Kool Verb": { label: "Kool Verb", description: "Audio reverb effect.", tags: ["audio", "effect"] },
    "Nylon Guitar": { label: "Nylon Guitar", description: "MIDI guitar instrument.", tags: ["audio", "midi", "instrument"] },
    "Micro 54": { label: "Micro 54", description: "MIDI synthesizer.", tags: ["audio", "midi", "instrument"] },
    "Tiny Synth": { label: "Tiny Synth", description: "MIDI synthesizer.", tags: ["audio", "midi", "instrument"] },
    "Random Note": { label: "Random Note", description: "Random MIDI note generator.", tags: ["midi", "generator"] },
    "Drum": { label: "Drum", description: "Drum sampler controlled by MIDI.", tags: ["audio", "midi", "instrument", "drum"] },
}

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
        "hyperkeyboard", "drumplatekit", "automation_controller", "the_cube", "harp", "large_harp", "voice", "gaze", "sequencer12", "sequencer16", "audio_plaque", "superformula", "superformula3d", "fluid_field", "ai_composer", "ai_composer_improv", "ai_composer_drums", "ai_composer_basic", "ai_composer_vae",
        ...WAM3D_EXAMPLE_NAMES.map(k => `wam3d-${k}`),
        ...SERVER_KINDS.map(k => `server-${k}`),
    ]

    private async loadWam3DGeneratorFactory() {
        return (await import("../node3d/subs/Wam3DGeneratorN3D.ts")).Wam3DGeneratorN3DFactory
    }

    private async loadWamExample(name: string): Promise<WAMGuiInitCode | null> {
        const { examples } = await import("wam3dgenerator")
        return (examples as Record<string, WAMGuiInitCode>)[name] ?? null
    }

    public getCatalogEntry(kind: string): Node3DCatalogEntry | null {
        if (!kind || kind.trim() === "" || kind.length > 20_000) return null

        const builtinEntry = BUILTIN_CATALOG_ENTRIES[kind]
        if (builtinEntry) return { kind, ...builtinEntry }

        if (kind == "butterchurn") return { kind, label: "Butterchurn", description: "Audio-reactive visualizer.", tags: ["video", "generator"] }
        if (kind == "isf_shader") return { kind, label: "ISF Shader", description: "Interactive shader visualizer.", tags: ["video", "generator"] }
        if (kind == "screen") return { kind, label: "Screen", description: "Video screen.", tags: ["video", "consumer"] }
        if (kind == "box_screen") return { kind, label: "Box Screen", description: "Box video screen.", tags: ["video", "consumer"] }
        if (kind == "sphere_screen") return { kind, label: "Sphere Screen", description: "Sphere video screen.", tags: ["video", "consumer"] }
        if (kind == "cylinder_screen") return { kind, label: "Cylinder Screen", description: "Cylinder video screen.", tags: ["video", "consumer"] }
        if (kind.startsWith("ai_composer")) return { kind, label: "AI Composer", description: "AI MIDI generator.", tags: ["midi", "generator"] }

        if (kind.startsWith("wam3d-")) {
            const name = kind.substring(6)
            const entry = WAM3D_EXAMPLE_METADATA[name]
            return entry ? { kind, ...entry } : { kind, label: name, description: "WebAudioModule.", tags: ["audio"] }
        }
        if (kind.startsWith("server-")) {
            const name = kind.substring("server-".length)
            const tags = name.toLowerCase().includes("pro54") ? ["audio", "midi", "instrument"] : ["audio"]
            return { kind, label: name, description: "Server WebAudioModule.", tags }
        }
        if (kind.startsWith("url:")) return { kind, label: "External WAM", description: kind.substring(4), tags: ["audio"] }
        if (kind.startsWith("desc:") || kind.startsWith("{")) return { kind, label: "Imported module", description: "Imported Node3D module.", tags: ["audio"] }

        return null
    }

    /** Parse a imported code into a node3DFactory */
    private async parseFactory(code: string): Promise<Node3DFactory<Node3DGUI, Node3D> | null> {
        const json = JSON.parse(code) as Node3DConfig

        if ("controls" in json && "wam_url" in json) {
            const Wam3DGeneratorN3DFactory = await this.loadWam3DGeneratorFactory()
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
        const builtinLoader = BUILTIN_FACTORY_LOADERS[kind]
        if (builtinLoader) return await builtinLoader()
        if (kind.startsWith("ai_composer")) {
            const { AIComposerN3DFactory } = await import("../node3d/subs/ai/AIComposerN3D.ts")
            if (kind == "ai_composer") return AIComposerN3DFactory.MELODY;
            if (kind == "ai_composer_improv") return AIComposerN3DFactory.IMPROV;
            if (kind == "ai_composer_drums") return AIComposerN3DFactory.DRUMS;
            if (kind == "ai_composer_basic") return AIComposerN3DFactory.BASIC;
            if (kind == "ai_composer_vae") return AIComposerN3DFactory.VAE;
        }
        if (kind == "butterchurn") return (await import("../node3d/subs/visualizer/ButterchurnN3D.ts")).ButterchurnN3DFactory
        if (kind == "isf_shader") return (await import("../node3d/subs/visualizer/IsfShaderN3D.ts")).IsfShaderN3DFactory
        if (kind == "screen") return (await import("../node3d/subs/visualizer/ScreenN3D.ts")).ScreenN3DFactory
        if (kind == "box_screen") return (await import("../node3d/subs/visualizer/BoxScreenN3D.ts")).BoxScreenN3DFactory
        if (kind == "sphere_screen") return (await import("../node3d/subs/visualizer/SphereScreenN3D.ts")).SphereScreenN3DFactory
        if (kind == "cylinder_screen") return (await import("../node3d/subs/visualizer/CylinderScreenN3D.ts")).CylinderScreenN3DFactory

        // Wam3DGenerator examples
        if (kind.startsWith("wam3d-")) {
            const config = await this.loadWamExample(kind.substring(6))
            if (!config) return null

            // TODO: SUPPRIMER CA, on peut pas mettre du scotch DANS le code parce qu'un
            // node3d est mal implémenté.
            const Wam3DGeneratorN3DFactory = await this.loadWam3DGeneratorFactory()
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
            const Wam3DGeneratorN3DFactory = await this.loadWam3DGeneratorFactory()
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
