import {Wam3D} from "../ConnecterWAM/Wam3D.ts";
import {IWamConfig} from "../shared/SharedTypes.ts";
import {AudioOutput3D} from "./AudioOutput3D.ts";


// const WAM_CONFIGS_URL: string = "https://wam-configs.onrender.com";
const WAM_CONFIGS_URL: string = "http://localhost:3000";

export class AudioNode3DBuilder {
    constructor(private readonly _audioCtx: AudioContext) {
    }

    public async create(id: string, configFile?: string): Promise<Wam3D> {
        console.log("CONFIG FILE NEW : " + configFile)
        const response: Response = await fetch(`${WAM_CONFIGS_URL}/wamsConfig/${configFile}`, {
            method: "get",
            headers: {"Content-Type": "application/json"}
        });
        console.log("Config File: ", configFile);
        const configString: string = await response.json();
        console.log("Config String ", configString);
        const config: IWamConfig = JSON.parse(configString);
        return new Wam3D(this._audioCtx, id, config, configFile!);
    }

    public async createAudioOutput(id: string): Promise<AudioOutput3D> {
            return new AudioOutput3D(this._audioCtx, id);
    }
}
