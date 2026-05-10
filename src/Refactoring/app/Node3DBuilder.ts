import { Node3DInstance } from "../node3d/instance/Node3DInstance.ts";
import { Node3D, Node3DFactory, Node3DGUI } from "../node3d/Node3D.ts";
import { OscillatorN3DFactory } from "../node3d/subs/OscillatorN3D.ts";
import { Node3dManager } from "./Node3dManager.ts";
import { SceneManager } from "./SceneManager.ts";
import { WamInitializer } from "./WamInitializer.ts";
import { WAMGuiInitCode, examples } from "wam3dgenerator";
import { Wam3DGeneratorN3DFactory } from "../node3d/subs/Wam3DGeneratorN3D.ts";
import { SequencerN3DFactory } from "../node3d/subs/SequencerN3D.ts";
import { N3DShared } from "../node3d/instance/N3DShared.ts";
import { MaracasN3DFactory } from "../node3d/subs/maracas/MaracasN3D.ts";
import { NoteBoxN3DFactory } from "../node3d/subs/NoteBoxN3D.ts";
import { SpeakerN3DFactory } from "../node3d/subs/speaker/SpeakerN3D.ts";
import { PianoRollN3DFactory } from "../node3d/subs/PianoRoll/PianoRoll3d.ts";
import { DrumKitN3DFactory } from "../node3d/subs/drumkit/DrumKitN3D.ts";
import { ButterchurnN3DFactory } from "../node3d/subs/visualizer/ButterchurnN3D.ts";
import { ScreenN3DFactory } from "../node3d/subs/visualizer/ScreenN3D.ts";
import { LivePianoN3DFactory } from "../node3d/subs/note_generator/LivePianoN3D.ts";
import { HyperKeyboardN3DFactory } from "../node3d/subs/note_generator/HyperKeyboardN3D.ts";
import { DrumPlateKitN3DFactory } from "../node3d/subs/note_generator/DrumPlateKitN3D.ts";
import { AutomationControllerN3DFactory } from "../node3d/subs/automation/AutomationControllerN3D.ts";
import { PositionCubeN3DFactory } from "../node3d/subs/automation/PositionCubeN3D.ts";
import { HarpN3DFactory } from "../node3d/subs/note_generator/HarpN3D.ts";
import { GazeControllerN3DFactory } from "../node3d/subs/automation/GazeControllerN3D.ts";
import { VoiceVolumeControllerN3DFactory } from "../node3d/subs/automation/VoiceVolumeControllerN3D.ts";
import { SyncDebugN3DFactory } from "../node3d/subs/debug/SyncDebugN3D.ts";
import { N3DRendering } from "../node3d/instance/utils/N3DRendering.ts";
import { AbstractMesh, CreatePlane, Vector4, VertexBuffer } from "@babylonjs/core";
import { TextureAtlas } from "../utils/atlas.ts";
import { AutoDispose } from "../utils/auto_dispose.ts";



const WAM_CONFIGS_URL: string = `http://${window.location.hostname}:3000`;
export type Node3DConfig = { name: string, wam3d: WAMGuiInitCode }
const additionalConfig: Record<string, any> = await fetch(`${WAM_CONFIGS_URL}/wamsConfig/additionalConfigs.json`).then(r => r.json())

/**
 * The Node3DBuilder is responsible for creating Node3D instances from their kind name.
 * It map a kind name to a Node3DFactory.
 */
export class Node3DBuilder {

    /**
     * Some of the valid kinds of Node3D.
     */
    FACTORY_KINDS = [
        "audiooutput", "oscillator", "maracas", "livepiano", "notesbox", "pianoroll", "drumkit", "pro54michel", "butterchurn", "screen",
        "hyperkeyboard", "drumplatekit", "automation_controller", "the_cube", "harp", "large_harp", "voice", "gaze", "sequencer",
        ...Object.keys(examples).map(k => `wam3d-${k}`),
        ...Object.keys(additionalConfig).map(k => `add-` + k)
    ]

    private async parseFactory(code: string): Promise<Node3DFactory<Node3DGUI, Node3D> | null> {
        const json = JSON.parse(code) as Node3DConfig

        if ("wam3d" in json) {
            return await Wam3DGeneratorN3DFactory.create(json.wam3d)
        }
        else if ("bottom_color" in json) {
            return await Wam3DGeneratorN3DFactory.create(json)
        }

        return null
    }

    private async createFactories(kind: string): Promise<Node3DFactory<Node3DGUI, Node3D> | null> {
        // Dynamic 
        if (kind.startsWith("desc:")) {
            const description = kind.substring(5)
            return await this.parseFactory(description)
        }

        // Dynamic from url
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

        // Builtin
        if (kind == "audiooutput") return SpeakerN3DFactory
        if (kind == "sequencer") return SequencerN3DFactory
        if (kind == "oscillator") return OscillatorN3DFactory
        if (kind == "maracas") return MaracasN3DFactory
        if (kind == "livepiano") return LivePianoN3DFactory
        if (kind == "notesbox") return NoteBoxN3DFactory
        if (kind == "pianoroll") return PianoRollN3DFactory
        if (kind == "drumkit") return DrumKitN3DFactory
        if (kind == "butterchurn") return ButterchurnN3DFactory
        if (kind == "screen") return ScreenN3DFactory
        if (kind == "hyperkeyboard") return HyperKeyboardN3DFactory.SMALL
        if (kind == "drumplatekit") return DrumPlateKitN3DFactory.SMALL
        if (kind == "automation_controller") return AutomationControllerN3DFactory
        if (kind == "the_cube") return PositionCubeN3DFactory.DEFAULT
        if (kind == "harp") return HarpN3DFactory.DEFAULT
        if (kind == "large_harp") return HarpN3DFactory.LARGE
        if (kind == "gaze") return GazeControllerN3DFactory
        if (kind == "voice") return VoiceVolumeControllerN3DFactory
        //if(kind=="function_sequencer") return FunctionSequencerN3DFactory.DEFAULT

        // Debug
        if (kind == "sync_debug") return SyncDebugN3DFactory

        // Wam3DGenerator examples
        if (kind.startsWith("wam3d-")) {
            const config = (examples as Record<string, WAMGuiInitCode>)[kind.substring(6)]
            if (!config) return null
            return await Wam3DGeneratorN3DFactory.create(config)
        }

        // Additional configs from server
        if (kind.startsWith("add-")) {
            const config = additionalConfig[kind.substring(4)]
            if (!config) return null
            return await Wam3DGeneratorN3DFactory.create(config)
        }

        // Configs
        {
            const response = await fetch(`${WAM_CONFIGS_URL}/wamsConfig/${kind}.json`, { method: "get", headers: { "Content-Type": "application/json" } })
            if (response.ok) return await this.parseFactory(await response.text())
        }

        return null
    }

    private factories = new Map<string, Promise<Node3DFactory<Node3DGUI, Node3D> | null>>()

    /**
     * Get a Node3DFactory from it kind name.
     * @param kind The kind of Node3D, correspond to the name of its config file.
     * @returns 
     */
    public getFactory(kind: string): Promise<Node3DFactory<Node3DGUI, Node3D> | null> {
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
        async () => (await new N3DRendering(SceneManager.getInstance().getScene(), 128).initialize()).createAggregator(),
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
                const url = await renderer.draw(factory)

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
            SceneManager.getInstance().getShadowGenerator(),
            Node3dManager.getInstance().getAudioContext(),
            Node3dManager.getInstance().getAudioEngine(),
            (await WamInitializer.getInstance(Node3dManager.getInstance().getAudioContext()).getHostGroupId())[0]
        )

        // Get WAMs configs from server
        try {
            const config_ids = await fetch(`${WAM_CONFIGS_URL}/wamsConfig`, { method: "get", headers: { "Content-Type": "application/json" } })
            if (config_ids.ok) {
                const ids: string[] = await config_ids.json()
                for (const id of ids) {
                    this.FACTORY_KINDS = [id, ...this.FACTORY_KINDS]
                }
            }
        } catch (_) { }
    }

    private async instantiateNode3d(factory: Node3DFactory<any, any>): Promise<Node3DInstance> {
        const instance = new Node3DInstance(this.getShared(), factory)
        await instance.instantiate()
        return instance
    }
}
