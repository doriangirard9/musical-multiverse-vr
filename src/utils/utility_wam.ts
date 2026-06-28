import { AudioWorkletGlobalScope } from "@webaudiomodules/api";
import { WamNode, WamProcessor, WebAudioModule } from "@webaudiomodules/sdk";


export function getUtilityWamProcessor(moduleId: string){
    const worklet = globalThis as any as AudioWorkletGlobalScope
    const module = worklet.webAudioModules.getModuleScope(moduleId)
    
    const WP = module.WamProcessor as typeof WamProcessor


    class UtilityWamProcessor extends WP{
    }


    try{
        worklet.registerProcessor(moduleId, UtilityWamProcessor)
    }catch(e){}
}


export class UtilityWAMNode extends WamNode{

    async addModules(audioContext: BaseAudioContext, moduleId: string){
        await WamNode.addModules(audioContext, moduleId)
    }

    constructor(wam: UtilityWebAudioModule, options: AudioWorkletNodeOptions){
        super(wam, options)
    }
    
}

export class UtilityWebAudioModule extends WebAudioModule{

    async createAudioNode(initialState?: any): Promise<WamNode> {
        await UtilityWAMNode.addModules(this.audioContext, this.moduleId)
        const node = new UtilityWAMNode(this, {
        })
        await node._initialize()
        return node
    }
}