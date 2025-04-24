import * as B from "@babylonjs/core";

import {Wam3D} from "../ConnecterWAM/Wam3D.ts";
import {IAudioNodeConfig, IWamConfig} from "../shared/SharedTypes.ts";
import {AudioOutput3D} from "./AudioOutput3D.ts";


// const WAM_CONFIGS_URL: string = "https://wam-configs.onrender.com";
const WAM_CONFIGS_URL: string = "http://localhost:3000";

export class AudioNode3DBuilder {
    constructor(private readonly _scene: B.Scene, private readonly _audioCtx: AudioContext) {}

    public async create(name: string, id: string, configFile?: IAudioNodeConfig): Promise<Wam3D> {

        if (name === "audioOutput") {
            return new AudioOutput3D(this._scene, this._audioCtx, id);
        }
        // WAMs
        else {
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
    }
}