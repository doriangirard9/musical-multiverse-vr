import { Node3DInstance } from "../ConnecterWAM/node3d/instance/Node3DInstance.ts";
import { Node3DFactory } from "../ConnecterWAM/node3d/Node3D.ts";
import { OscillatorN3DFactory } from "../ConnecterWAM/node3d/subs/OscillatorN3D.ts";
import { AudioOutputN3DFactory } from "../ConnecterWAM/node3d/subs/AudioOutputN3D.ts";
import { Node3dManager } from "./Node3dManager.ts";
import { SceneManager } from "./SceneManager.ts";
import { UIManager } from "./UIManager.ts";
import { WamInitializer } from "./WamInitializer.ts";


// const WAM_CONFIGS_URL: string = "https://wam-configs.onrender.com";
const WAM_CONFIGS_URL: string = "http://localhost:3000";

export class Node3DBuilder {

    constructor(private readonly _audioCtx: AudioContext) {
    }

    /**
     * Create a Node3D from a kind name and a configuration
     * The Node3D is not added to the world, it should be added before being used.
     * @param id The id of the Node3D, unique for every Node3D
     * @param kind The kind of Node3D, correspond to the name of its config file.
     * @returns The new Node3D or a description of the error
     */
    public async create(kind: string): Promise<Node3DInstance|string> {
        
        if(kind=="audiooutput") return await this.instantiateNode3d(AudioOutputN3DFactory)
        else if(kind=="oscillator") return await this.instantiateNode3d(OscillatorN3DFactory)
        return "Unknown error"
        // Wam 3d
        /*else{
            const response = await fetch(`${WAM_CONFIGS_URL}/wamsConfig/${kind}.json`,{method:"get",headers:{"Content-Type":"application/json"}})
            if(!response.ok)return `AudioNode3d of type ${kind} does not exists`
            const config = await response.json() as IWamConfig
            return new Wam3D(this._audioCtx, id, config, kind)
        }*/
        return "Unknown error"
    }

    private async instantiateNode3d(factory: Node3DFactory<any,any>): Promise<Node3DInstance> {
        const scene = SceneManager.getInstance().getScene()
        const uiManager = UIManager.getInstance()
        const audioManager = Node3dManager.getInstance()
        const [hostId] = await WamInitializer.getInstance(audioManager.getAudioContext()).getHostGroupId()
        const instance = new Node3DInstance(scene, uiManager, audioManager.getAudioContext(), hostId, factory)
        await instance.instantiate()
        return instance
    }
}
