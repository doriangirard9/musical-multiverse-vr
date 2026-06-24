import { InputManager } from "../xr/inputs"

const UPDATE_FREQUENCY = 10 //Hz


/**
 * The AudioWorldSystem manages the sound spatialization, and sound production in the application.
 * It manages:
 * - Sound spatialization
 */
export class AudioWorldSystem {



    // Instance
    static _instance?: AudioWorldSystem

    static async initialize(...network: ConstructorParameters<typeof AudioWorldSystem>){
        this._instance = new AudioWorldSystem(...network)
    }

    static getInstance(): AudioWorldSystem {
        if(!this._instance) throw new Error("AudioWorldSystem not initialized. Call initialize() first.")
        return this._instance
    }

    constructor(
        private audioContext: AudioContext,
        private inputs: InputManager,
    ){
        setInterval(()=>this.tick(1/UPDATE_FREQUENCY), 1000/UPDATE_FREQUENCY)
    }

    tick(delta: number){
        const audioCtx = this.audioContext
        const head = this.inputs.head
        for(const [parameter, value] of [
            [audioCtx.listener.positionX, head.origin.x],
            [audioCtx.listener.positionY, head.origin.y],
            [audioCtx.listener.positionZ, -head.origin.z],

            [audioCtx.listener.forwardX, head.forward.x],
            [audioCtx.listener.forwardY, head.forward.y],
            [audioCtx.listener.forwardZ, -head.forward.z],

            [audioCtx.listener.upX, head.up.x],
            [audioCtx.listener.upY, head.up.y],
            [audioCtx.listener.upZ, -head.up.z],
        ] as [AudioParam,number][]){
            // setTargetAtTime change le paramètre de manière progressive et évite les "pop"
            parameter.setTargetAtTime(value, audioCtx.currentTime, delta*.9)
        }
    }
}

