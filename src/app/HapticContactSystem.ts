import { InputManager } from "../xr/inputs/InputManager"
import { WamTransportManager } from "./WamTransportManager"


/**
 * A haptic system.
 * It is responsible for triggering haptic feedback on the controllers when a pointer touches a mesh.
 * Also send pulse synchronized on beats.
 */
export class HapticContactSystem {

    // Instance
    static _instance?: HapticContactSystem

    static async initialize(...network: ConstructorParameters<typeof HapticContactSystem>){
        this._instance = await new HapticContactSystem(...network)
    }

    static getInstance(): HapticContactSystem {
        if(!this._instance) throw new Error("HapticContact not initialized. Call initialize() first.")
        return this._instance
    }

    // Haptic Contact
    constructor(
        readonly inputs: InputManager,
        readonly transport: WamTransportManager,
    ){
        // Haptic contact
        for(const controller of [inputs.left, inputs.right]){
            controller.pointer.onNewTouch.add((pointer) => {
                if(pointer.isTouching){
                    controller.pulse(0.1, 100, 0)
                }
                else{
                    controller.pulse(0.1, 50, 1)
                }
            })
        }

        /*if you want to beep without using a wave file*/
        var context = new AudioContext();
        var oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = 800;
        oscillator.connect(context.destination);
        
        // Haptic Beat
        let lastBeat = 0
        function hapticBeat(){
            if(transport.isPlaying){
                inputs.left.pulse(.05,10)
                inputs.right.pulse(.05,10)
            }
            const beatDuration = 60/transport.getTempo()
            let nextBeatTime = Math.ceil(transport.getElapsedSeconds()/beatDuration)*beatDuration
            if(nextBeatTime<=lastBeat){
                nextBeatTime += beatDuration
            }
            lastBeat = nextBeatTime
            const currentTime = transport.getElapsedSeconds()
            const delay = Math.max(0, nextBeatTime - currentTime)
            setTimeout(hapticBeat, delay*1000)
        }
        hapticBeat()
    }

}
