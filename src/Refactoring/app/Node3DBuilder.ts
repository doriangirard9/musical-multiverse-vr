import { Node3DInstance } from "../node3d/instance/Node3DInstance.ts";
import { Node3DFactory } from "../node3d/Node3D.ts";
import { OscillatorN3DFactory } from "../node3d/subs/OscillatorN3D.ts";
import { AudioOutputN3DFactory } from "../node3d/subs/AudioOutputN3D.ts";
import { Node3dManager } from "./Node3dManager.ts";
import { SceneManager } from "./SceneManager.ts";
import { WamInitializer } from "./WamInitializer.ts";
import { WAMGuiInitCode } from "wam3dgenerator";
import { Wam3DGeneratorN3DFactory } from "../node3d/subs/Wam3DGeneratorN3D.ts";
import { SequencerN3DFactory } from "../node3d/subs/SequencerN3D.ts";
import { N3DShared } from "../node3d/instance/N3DShared.ts";
import { MaracasN3DFactory } from "../node3d/subs/maracas/MaracasN3D.ts";


// const WAM_CONFIGS_URL: string = "https://wam-configs.onrender.com";
const WAM_CONFIGS_URL: string = "http://localhost:3000";

export type Node3DConfig = {
    name: string,
    wam3d: WAMGuiInitCode
}

export class Node3DBuilder {

    /**
     * Create a Node3D from a kind name and a configuration
     * The Node3D is not added to the world, it should be added before being used.
     * @param id The id of the Node3D, unique for every Node3D
     * @param kind The kind of Node3D, correspond to the name of its config file.
     * @returns The new Node3D or a description of the error
     */
    public async create(kind: string): Promise<Node3DInstance|string> {
        
        // TODO: Il y a peut être plus propre que des if/else
        if(kind=="audiooutput") return await this.instantiateNode3d(AudioOutputN3DFactory)
        else if(kind=="sequencer") return await this.instantiateNode3d(SequencerN3DFactory)
        else if(kind=="oscillator") return await this.instantiateNode3d(OscillatorN3DFactory)
        else if(kind=="maracas") return await this.instantiateNode3d(MaracasN3DFactory)
        else{
            const response = await fetch(`${WAM_CONFIGS_URL}/wamsConfig/${kind}.json`,{method:"get",headers:{"Content-Type":"application/json"}})
            if(!response.ok)return `AudioNode3d of type ${kind} does not exists`
            const config = await response.json() as Node3DConfig

            // Wam3DGenerator
            if("wam3d" in config)return await this.instantiateNode3d(new Wam3DGeneratorN3DFactory(config.name, config.wam3d))
        }
        return "Unknown error"
    }

    private shared: N3DShared|null = null

    private async instantiateNode3d(factory: Node3DFactory<any,any>): Promise<Node3DInstance> {

        const shared = this.shared ??= new N3DShared(
            SceneManager.getInstance().getScene(),
            Node3dManager.getInstance().getAudioContext(),
            (await WamInitializer.getInstance(Node3dManager.getInstance().getAudioContext()).getHostGroupId())[0]
        )

        const audioManager = Node3dManager.getInstance()
        const instance = new Node3DInstance(shared, factory)
        await instance.instantiate()
        return instance
    }
}
