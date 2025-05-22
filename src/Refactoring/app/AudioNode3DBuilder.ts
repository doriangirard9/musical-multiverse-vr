import { AudioNode3D } from "../ConnecterWAM/AudioNode3D.ts";
import { Node3DInstance } from "../ConnecterWAM/node3d/instance/Node3DInstance.ts";
import { Node3DFactory } from "../ConnecterWAM/node3d/Node3D.ts";
import { OscillatorN3DFactory } from "../ConnecterWAM/node3d/subs/OscillatorN3D.ts";
import { AudioOutputN3DFactory } from "../ConnecterWAM/node3d/subs/AudioOutputN3D.ts";
import {Wam3D} from "../ConnecterWAM/Wam3D.ts";
import {IWamConfig} from "../shared/SharedTypes.ts";
import { AudioManager } from "./AudioManager.ts";
import { SceneManager } from "./SceneManager.ts";
import { UIManager } from "./UIManager.ts";
import { WamInitializer } from "./WamInitializer.ts";


// const WAM_CONFIGS_URL: string = "https://wam-configs.onrender.com";
const WAM_CONFIGS_URL: string = "http://localhost:3000";

export class AudioNode3DBuilder {
    constructor(private readonly _audioCtx: AudioContext) {
    }

    /**
     * Create a AudioNode3d from a kind name and a configuration
     * The AudioNode3d is not added to the world, it should be added before being used.
     * @param id The id of the AudioNode3D, unique for every AudioNode3d
     * @param kind The kind of AudioNode3D, correspond to the name of its config file.
     * @returns The new AudioNode3D or a description of the error
     */
    public async create(id: string, kind: string): Promise<AudioNode3D|string> {
        
        // Builtin Output 
        if(kind=="audiooutput"){
            return await this.createNode3D(id, kind, AudioOutputN3DFactory)
        }
        // Builtin Test
        else if(kind=="oscillator"){
            return await this.createNode3D(id, kind, OscillatorN3DFactory)
        }
        // Wam 3d
        else{
            const response = await fetch(`${WAM_CONFIGS_URL}/wamsConfig/${kind}.json`,{method:"get",headers:{"Content-Type":"application/json"}})
            if(!response.ok)return `AudioNode3d of type ${kind} does not exists`
            const config = await response.json() as IWamConfig
            return new Wam3D(this._audioCtx, id, config, kind)
        }
        return "Unknown error"
    }

    private async createNode3D(id: string, kind:string, factory: Node3DFactory<any,any>): Promise<Node3DInstance> {
        const scene = SceneManager.getInstance().getScene()
        const uiManager = UIManager.getInstance()
        const audioManager = AudioManager.getInstance()
        const [hostId] = await WamInitializer.getInstance(audioManager.getAudioContext()).getHostGroupId()
        const instance = new Node3DInstance(id, kind, scene, uiManager, audioManager.getAudioContext(), hostId, factory)
        await instance.instantiate()
        return instance
    }
}
