import type { AudioWorkletGlobalScope, WamEvent, WamParameterInfoMap, WamTransportData } from "@webaudiomodules/api";
import type { WamProcessor } from "@webaudiomodules/sdk";
import type { FunctionAPI, NoteDefinition, ParameterDefinition } from "../api/FunctionAPI";
import type { RemoteUI, RemoteUIElement } from "../api/RemoteUI";
import type { FunctionKernel } from "../api/FunctionKernel";

declare const moduleId: string
const context = self as unknown as AudioWorkletGlobalScope
const module = context.webAudioModules.getModuleScope(moduleId)

const TWamProcessor = module.WamProcessor as typeof WamProcessor
const TFunctionAPI = module.FunctionAPI as typeof FunctionAPI
const TRemoteUI = module.RemoteUI as typeof RemoteUI

class Kernel implements FunctionKernel{

    constructor(private processor: FunctionSequencerProcessor){}

    highlight(name: string, value: boolean): void {
        this.processor.port.postMessage({highlight: {name, value}})
    }

    emitEvents(...event: WamEvent[]): void {
        this.processor.emitEvents(...event)
    }

    setNotelist(noteList?: NoteDefinition[]): void {
        this.processor.port.postMessage({noteList})
    }

    registerParameters(parameters: ParameterDefinition[]): void {
        const ids = new Set<string>()
        const filtered = parameters.flatMap(p =>{

            // Check needed
            if(
                p.config==undefined ||
                p.id==undefined ||
                ids.has(p.id) ||
            ) return []

            // Choices
            if(p.config.type=="choice"){
                if(p.config.choices==undefined) return []
                p.config.maxValue = p.config.choices.length-1
                p.config.minValue = 0
                p.config.discreteStep = 1
                p.config.exponent = 1
                p.config.
            }
            else if(p.config.type=="boolean"){
                p.config.maxValue = 1
                p.config.minValue = 0
                p.config.discreteStep = 1
                p.config.exponent = 1
            }
            else if(p.config.type=="float"){
                if(!p.config.minValue || !p.config.maxValue) return []
            }
            else if(p.config.type=="int"){
            }

        })
    }

    registerUI(element: RemoteUIElement): void {
        this.processor.port.postMessage({ui: element})
    }

    setAdditionalState(name: string, value: any): void {
        this.processor.additionalState.set(name, value)
        this.processor.isStateDirty = true
    }

    getAdditionalState(name: string) {
        return this.processor.additionalState.get(name)
    }

    get tempo(){
        return this.processor.transport.tempo
    }

    parameterIds: string[];

    get currentTime(){
        return context.currentTime
    }

    getParameterState(id: string): number {
        throw new Error("Method not implemented.");
    }
    
}

class FunctionSequencerProcessor extends TWamProcessor {

    additionalState
    isStateDirty
    transport: WamTransportData

    constructor(options?: any){
        super(options)

        this.additionalState = new Map<string, any>()
        
        this.isStateDirty = false

        this.transport = {
            tempo: 120,
            timeSigDenominator: 4,
            timeSigNumerator: 4,
            playing: false,
            currentBar: 0,
            currentBarStarted: 0
        }
    }

    _onTransport(transportData: WamTransportData): void {
        this.transport = transportData
    }

    async _onMessage(message: MessageEvent): Promise<void> {
        await super._onMessage(message)
        if(message.data.setScript){

        }
    }

    setScript(script: string){
        const factory = new Function('api', 'ui', script)
        const instance = factory(module.api, module.ui)
        instance.init(module.api, module.ui)
    }

    // Parameters management //

    _generateWamParameterInfo(): WamParameterInfoMap {
        const ret = {} as WamParameterInfoMap
        ret["aa"] = {

        }
        return ret
    }

}

context.registerProcessor(moduleId, FunctionSequencerProcessor)
