import * as B from "@babylonjs/core";
import {AudioNode3D} from "./AudioNode3D.ts";
import {IAudioNodeConfig, IWamConfig} from "./types.ts";
import {SimpleOscillator3D} from "./SimpleOscillator3D.ts";
import {AudioOutput3D} from "./AudioOutput3D.ts";
import {Wam3D} from "./Wam3D.ts";
import {StepSequencer3D} from "./StepSequencer3D.ts";
import {RandomNote3D} from "./RandomNote3D.ts";
import {Instrument3D} from "./Instrument3D.ts";
import { PianoRoll } from "./PianoRoll3D.ts";
import {Modulation} from "./Modulation.ts";

// const WAM_CONFIGS_URL: string = "https://wam-configs.onrender.com";
const WAM_CONFIGS_URL: string = "http://localhost:3000";

export class AudioNode3DBuilder {
    constructor(private readonly _scene: B.Scene, private readonly _audioCtx: AudioContext) {}

    public async create(name: string, id: string, configFile?: IAudioNodeConfig, parent?: Instrument3D, paramModul?:number): Promise<AudioNode3D> {
        if (name === "simpleOscillator") {
            const response: Response = await fetch(`${WAM_CONFIGS_URL}/coreConfig/simpleOscillatorConfig`, {
                method: "get",
                headers: {"Content-Type": "application/json"}
            });
            const configString: string = await response.json();
            const config: IAudioNodeConfig = JSON.parse(configString);
            return new SimpleOscillator3D(this._scene, this._audioCtx, id, config);
        }
        else if (name === "stepSequencer") {
            return new StepSequencer3D(this._scene, this._audioCtx, id);
        }
        else if (name === "audioOutput") {
            return new AudioOutput3D(this._scene, this._audioCtx, id);
        }
        else if (name === "Random Note") {
            console.log("Random Note");
            const config: IWamConfig = await import(/* @vite-ignore */`../wamsConfig/${configFile}.json`);
            return new RandomNote3D(this._scene, this._audioCtx, id, config, configFile!);
        }
        else if (name === "Spectrum Modal") {
            console.log("Spectrum Modal");
            const config: IWamConfig = await import(/* @vite-ignore */`../wamsConfig/${configFile}.json`);
            return new Instrument3D(this._scene, this._audioCtx, id, config, configFile!);
        }
        else if (name === "PianoRoll") {
            const config: IWamConfig = await import(/* @vite-ignore */`../coreConfig/PianoRollConfig.json`);
            // const configString: string = await response.json();
            return new PianoRoll(this._scene, this._audioCtx, id, config, configFile!);
        }
        else if (name==="modulation"){
            const config: IWamConfig = await import(/* @vite-ignore */`../coreConfig/PianoRollConfig.json`);
            // const configString: string = await response.json();
            let tmp= new Modulation(this._scene, this._audioCtx, id, config, configFile!,name,parent,paramModul);
            //await tmp.instantiate();
            //tmp.addUpdateTuyau();
            return tmp;
        }
        // WAMs
        else {
            console.log(name);
            const response: Response = await fetch(`${WAM_CONFIGS_URL}/wamsConfig/${configFile}`, {
                method: "get",
                headers: {"Content-Type": "application/json"}
            });
            console.log("Config File: ", configFile);
            const configString: string = await response.json();
            console.log("Config String ", configString);
            const config: IWamConfig = JSON.parse(configString);
            return new Wam3D(this._scene, this._audioCtx, id, config, configFile!);
        }
    }


}