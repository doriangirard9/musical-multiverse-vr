import {AudioWorkletProcessor} from "../../api";
import {registerProcessor} from "tone/build/esm/core/worklet/WorkletGlobalScope";

class worklettest extends AudioWorkletProcessor {

    private audioctx: AudioContext;
    private lastTime: number = 0;
    private phase: number = 0;

    constructor(AudioContext: AudioContext) {
       super();
       this.audioctx = AudioContext;
    }


    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: any): boolean {
        const freqX = parameters.freqX[0];
        const freqY = parameters.freqY[0];
        const ampX = parameters.ampX[0];
        const ampY = parameters.ampY[0];
        const phase = parameters.phase[0];
        const centerValue = parameters.centerValue[0];

        const currentTime = this.audioctx.currentTime;
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        this.phase += deltaTime;

        const t = this.phase;

        const centerX = this.canvasWidth / 2;
        const centerY = this.canvasHeight / 2;

        const x = Math.sin(freqX * t + phase);
        const y = Math.sin(freqY * t);

        const dotX = centerX + ampX * centerX * x;
        const dotY = centerY + ampY * centerY * y;

        this.port.postMessage({
            type: 'dotPosition',
            x: dotX,
            y: dotY
        });

        const modulationValue = ampX * Math.sin(freqX * t + phase);

        if (this.targetParam) {
            this.proxy.emitEvents({
                type: 'wam-automation',
                data: {
                    id: this.targetParam,
                    value: centerValue + modulationValue * 0.5,
                    normalized: true
                },
                time: currentTime
            });
        }

        return true;
    }


}

registerProcessor("testOrbiter", worklettest);
