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
import { LivePianoN3DFactory } from "../node3d/subs/LivePianoN3D.ts";
import {NoteBoxN3DFactory} from "../node3d/subs/NoteBoxN3D.ts";
import { SpeakerN3DFactory } from "../node3d/subs/speaker/SpeakerN3D.ts";
import {PianoRollN3DFactory} from "../node3d/subs/PianoRoll/PianoRoll3d.ts";


const WAM_CONFIGS_URL: string = `https://${window.location.hostname}:3000`;
export type Node3DConfig = { name: string, wam3d: WAMGuiInitCode }

export class Node3DBuilder {

    /**
     * Some of the valid kinds of Node3D.
     */
    FACTORY_KINDS = [
        "audiooutput", "sequencer", "oscillator", "maracas", "livepiano", "notesbox","pianoroll",
        ...Object.keys(examples).map(k => `wam3d-${k}`),
    ]

    private async createFactories(kind: string): Promise<Node3DFactory<Node3DGUI,Node3D>|null> {
        // Builtin
        if(kind=="audiooutput") return SpeakerN3DFactory
        if(kind=="sequencer") return SequencerN3DFactory
        if(kind=="oscillator") return OscillatorN3DFactory
        if(kind=="maracas") return MaracasN3DFactory
        if(kind=="livepiano") return LivePianoN3DFactory
        if(kind=="notesbox") return NoteBoxN3DFactory
        if(kind=="pianoroll") return PianoRollN3DFactory

        // Wam3DGenerator examples
        if(kind.startsWith("wam3d-")) {
            const config = (examples as Record<string,WAMGuiInitCode>)[kind.substring(6)]
            if(!config) return null
            return await Wam3DGeneratorN3DFactory.create(config)
        }

        // Configs
        {
            const response = await fetch(`${WAM_CONFIGS_URL}/wamsConfig/${kind}.json`,{method:"get",headers:{"Content-Type":"application/json"}})
            if(response.ok){
                const config = await response.json() as Node3DConfig

                // Wam3DGenerator
                if("wam3d" in config)return await Wam3DGeneratorN3DFactory.create(config.wam3d)
            }

        }


        return null
    }

    private factories = new Map<string,Node3DFactory<Node3DGUI,Node3D>>()

    /**
     * Get a Node3DFactory from it kind name.
     * @param kind The kind of Node3D, correspond to the name of its config file.
     * @returns 
     */
    public async getFactory(kind: string): Promise<Node3DFactory<Node3DGUI,Node3D>|null> {
        if(!this.factories.has(kind)){
            const factory = await this.createFactories(kind)
            if(factory)this.factories.set(kind, factory)
        }
        return this.factories.get(kind) ?? null
    }

    /**
     * Create a Node3D from a kind name and a configuration
     * The Node3D is not added to the world, it should be added before being used.
     * @param id The id of the Node3D, unique for every Node3D
     * @param kind The kind of Node3D, correspond to the name of its config file.
     * @returns The new Node3D or a description of the error
     */
    public async create(kind: string): Promise<Node3DInstance|string> {
        const factory = await this.getFactory(kind)
        if(factory==null)return `AudioNode3d of type ${kind} does not exists`

        return await this.instantiateNode3d(factory)
    }

    shared: N3DShared|null = null

    private async instantiateNode3d(factory: Node3DFactory<any,any>): Promise<Node3DInstance> {

        const shared = this.shared ??= new N3DShared(
            SceneManager.getInstance().getScene(),
            Node3dManager.getInstance().getAudioContext(),
            Node3dManager.getInstance().getAudioEngine(),
            (await WamInitializer.getInstance(Node3dManager.getInstance().getAudioContext()).getHostGroupId())[0]
        )

        const instance = new Node3DInstance(shared, factory)
        await instance.instantiate()
        return instance
    }
}
