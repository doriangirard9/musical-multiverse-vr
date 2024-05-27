import * as B from "@babylonjs/core";
import {AudioNode3D} from "./AudioNode3D.ts";
import {IAudioNodeConfig, IWamConfig} from "./types.ts";
import {SimpleOscillator3D} from "./SimpleOscillator3D.ts";
import {AudioOutput3D} from "./AudioOutput3D.ts";
import {Wam3D} from "./Wam3D.ts";
import {StepSequencer3D} from "./StepSequencer3D.ts";

const WAM_CONFIGS_URL: string = "https://wam-configs.onrender.com";

export class AudioNode3DBuilder {
    constructor(private readonly _scene: B.Scene, private readonly _audioCtx: AudioContext) {}

    public async create(name: string, id: string, configFile?: string): Promise<AudioNode3D> {
        if (name === "simpleOscillator") {
            // @ts-ignore
            const config: IAudioNodeConfig = await import(/* @vite-ignore */`${WAM_CONFIGS_URL}/coreConfig/simpleOscillatorConfig`);
            return new SimpleOscillator3D(this._scene, this._audioCtx, id, config);
        }
        else if (name === "stepSequencer") {
            return new StepSequencer3D(this._scene, this._audioCtx, id);
        }
        else if (name === "audioOutput") {
            return new AudioOutput3D(this._scene, this._audioCtx, id);
        }
        // WAMs
        else {
            const config: IWamConfig = await import(/* @vite-ignore */`${WAM_CONFIGS_URL}/wamsConfig/${configFile}`);
            return new Wam3D(this._scene, this._audioCtx, id, config, configFile!);
        }
    }
}