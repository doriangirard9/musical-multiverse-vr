import { Vector3 } from "@babylonjs/core"
import { InputManager } from "../xr/inputs"

const UPDATE_FREQUENCY = 10 //Hz


/**
 * The AudioWorldSystem manages the sound spatialization, and sound production in the application.
 * It manages:
 * - Sound spatialization
 */
export class AudioWorldSystem {
    private static readonly DEFAULT_FORWARD = new Vector3(0, 0, 1)
    private static readonly DEFAULT_UP = new Vector3(0, 1, 0)



    // Instance
    static _instance?: AudioWorldSystem

    static async initialize(...network: ConstructorParameters<typeof AudioWorldSystem>){
        this._instance = new AudioWorldSystem(...network)
    }

    static getInstance(): AudioWorldSystem {
        if(!this._instance) throw new Error("AudioWorldSystem not initialized. Call initialize() first.")
        return this._instance
    }


    // Public API

    // TODO: utiliser ça au lieu de audioCtx.destination dans SpeakerN3D pour que le son passe par les filtres
    /** The destination node of the audio world. All audio sources should be connected to this node. */
    get destination(){
        return this._destinationNode
    }

    /**
     * Adds a filter to the audio world. The filter will be applied in the order specified by the `order` parameter.
     * @param input The input node of the filter. This is where the audio signal will be sent to be processed by the filter.
     * @param output The output node of the filter. This is where the processed audio signal will be sent after being processed by the filter.
     * @param order The order in which the filter will be applied. Filters with lower order values will be applied before filters with higher order values.
     * @returns 
     */
    addFilter(input: AudioNode, output: AudioNode, order: number){
        const obj = {input, output, order}
        this._filters.push(obj)
        this.updateFilters()
        return ()=>{
            const index = this._filters.indexOf(obj)
            if(index !== -1){
                this._filters.splice(index, 1)
                this.updateFilters()
            }
        }
    }

    // TODO: Utilise ça dans SpeakerN3D:
    // - Il faut donc ajouter un accès à ça, à l'API
    /**
     * Creates a sound generator that can be used to output audio in 3D space. 
     * The sound generator will be positioned at the specified position and will be oriented in the specified forward direction.
     * @param position The position of the sound generator in 3D space. This should be a function that returns a Vector3 representing the position.
     * @param forward The forward direction of the sound generator in 3D space. This should be a function that returns a Vector3 representing the forward direction.
     * @returns The sound generator. The sound generator has a pannerNode that can be used to connect audio sources to it, and a dispose method that can be used to clean up the sound generator when it is no longer needed.
     */
    createSoundOutput(position:()=>Vector3, forward:()=>Vector3){
        return this._createSoundGenerator(position, forward)
    }



    constructor(
        private audioContext: AudioContext,
        private inputs: InputManager,
    ){
        setInterval(()=>this.tick(1/UPDATE_FREQUENCY), 1000/UPDATE_FREQUENCY)
        this._destinationNode = audioContext.createGain()
        this._destinationNode.connect(audioContext.destination)
    }

    tick(delta: number){
        const audioCtx = this.audioContext
        const head = this.inputs.head
        const origin = this.sanitizeVector(head.origin, Vector3.Zero())
        const forward = this.sanitizeDirection(head.forward, AudioWorldSystem.DEFAULT_FORWARD)
        const up = this.sanitizeDirection(head.up, AudioWorldSystem.DEFAULT_UP)

        for(const [parameter, value] of [
            [audioCtx.listener.positionX, origin.x],
            [audioCtx.listener.positionY, origin.y],
            [audioCtx.listener.positionZ, -origin.z],

            [audioCtx.listener.forwardX, forward.x],
            [audioCtx.listener.forwardY, forward.y],
            [audioCtx.listener.forwardZ, -forward.z],

            [audioCtx.listener.upX, up.x],
            [audioCtx.listener.upY, up.y],
            [audioCtx.listener.upZ, -up.z],
        ] as [AudioParam,number][]){
            this.safeRamp(parameter, value, audioCtx.currentTime, delta)
        }
    }

    
    // Audio destination and filters
    private _destinationNode

    private _filters: {input: AudioNode, output: AudioNode, order: number}[] = []

    private _currentFilters: {input: AudioNode, output: AudioNode, order: number}[] = []

    private updateFilters(){
        // Cleanup
        let previous: AudioNode = this._destinationNode
        for(const filter of this._currentFilters){
            this.safeDisconnect(previous, filter.input)
            previous = filter.output
        }
        this.safeDisconnect(previous, this.audioContext.destination)

        // Setup
        this._currentFilters = this._filters.sort((a,b)=>a.order-b.order)
        previous = this._destinationNode
        for(const filter of this._currentFilters){
            previous.connect(filter.input)
            previous = filter.output
        }
        previous.connect(this.audioContext.destination)
    }

    private safeDisconnect(source: AudioNode, destination: AudioNode){
        try{
            source.disconnect(destination)
        }catch{
            // Some browsers throw when disconnecting a pair that was never connected.
        }
    }


    // Localised node
    private _createSoundGenerator(position:()=>Vector3, forward:()=>Vector3){
        const pannerNode = this.audioContext.createPanner()

        pannerNode.panningModel = 'HRTF'
        pannerNode.distanceModel = 'linear'
        pannerNode.refDistance = 5 // Distance de référence pour réduire le volume
        pannerNode.maxDistance = 6 // Distance maximale à laquelle le son sera réduit, passé cette distance le son ne sera pas réduit
        pannerNode.rolloffFactor = 1 // Vitesse de décroissance du volume en fonction de la distance

        pannerNode.connect(this._destinationNode)
        const interval = setInterval(()=>{
            const currentPosition = this.sanitizeVector(position(), Vector3.Zero())
            const currentForward = this.sanitizeDirection(forward(), AudioWorldSystem.DEFAULT_FORWARD)
            for(const [parameter, value] of [
                [pannerNode.positionX, currentPosition.x],
                [pannerNode.positionY, currentPosition.y],
                [pannerNode.positionZ, -currentPosition.z],

                [pannerNode.orientationX, currentForward.x],
                [pannerNode.orientationY, currentForward.y],
                [pannerNode.orientationZ, -currentForward.z],
            ] as [AudioParam,number][]){
                this.safeRamp(parameter, value, this.audioContext.currentTime, 1/UPDATE_FREQUENCY)
            }
        }, 1000/UPDATE_FREQUENCY)

        return {
            pannerNode,
            dispose: ()=>{
                clearInterval(interval)
                pannerNode.disconnect()
            },
        }
        
    }

    private sanitizeVector(vector: Vector3, fallback: Vector3): Vector3 {
        if (!this.isFiniteNumber(vector.x) || !this.isFiniteNumber(vector.y) || !this.isFiniteNumber(vector.z)) {
            return fallback.clone()
        }
        return vector.clone()
    }

    private sanitizeDirection(vector: Vector3, fallback: Vector3): Vector3 {
        const safe = this.sanitizeVector(vector, fallback)
        if (safe.lengthSquared() < 0.000001) {
            return fallback.clone()
        }
        return safe.normalize()
    }

    private safeRamp(parameter: AudioParam, value: number, time: number, delta: number): void {
        if (!this.isFiniteNumber(value)) return
        const previous = this.isFiniteNumber((parameter as any)._prevValue) ? (parameter as any)._prevValue : parameter.value
        const after = time + Math.max(delta, 1 / UPDATE_FREQUENCY) * 0.9

        try {
            if (typeof parameter.cancelAndHoldAtTime === "function") parameter.cancelAndHoldAtTime(time)
            else parameter.cancelScheduledValues(time)
            parameter.setValueAtTime(previous, time)
            parameter.linearRampToValueAtTime(value, after)
            ;(parameter as any)._prevValue = value
        } catch {
            try {
                parameter.setTargetAtTime(value, time, Math.max(delta * 0.5, 0.01))
                ;(parameter as any)._prevValue = value
            } catch {
                // Ignore browser-specific AudioParam scheduling failures rather than crashing the session.
            }
        }
    }

    private isFiniteNumber(value: number): boolean {
        return Number.isFinite(value)
    }
}
