// Minimal WAM whose only job is to RECEIVE events. The base WamProcessor
// forwards every dequeued event back to the main thread, where the WamNode
// dispatches it as a DOM CustomEvent (wam-midi, wam-transport, ...). The
// EventMonitorN3D listens to those. Ported from the official wam-examples
// "wamEventViewer" (processor hooks stubbed, no DSP, no HTML GUI).
import { WebAudioModule, WamNode, addFunctionModule } from "@webaudiomodules/sdk";
import type { WamNode as IWamNode } from "@webaudiomodules/api";

const MODULE_ID = "com.wamjamparty.event-monitor";

// Stringified into the AudioWorklet by addFunctionModule: must stay fully
// self-contained (no imports, no outer closure).
const getEventMonitorProcessor = (moduleId: string) => {
    const scope = globalThis as any;
    const { registerProcessor } = scope;
    const ModuleScope = scope.webAudioModules.getModuleScope(moduleId);
    const { WamProcessor } = ModuleScope;

    class EventMonitorProcessor extends WamProcessor {
        _onTransport() {}
        _onMidi() {}
        _onSysex() {}
        _onMpe() {}
        _onOsc() {}
        _process() {}
    }
    try {
        registerProcessor(moduleId, EventMonitorProcessor);
    } catch (e) {
        console.warn(e);
    }
    return EventMonitorProcessor;
};

class EventMonitorNode extends WamNode {
    static async addModules(audioContext: BaseAudioContext, moduleId: string): Promise<void> {
        await super.addModules(audioContext, moduleId);
        await addFunctionModule(audioContext.audioWorklet, getEventMonitorProcessor, moduleId);
    }
}

class EventMonitorWam extends WebAudioModule<WamNode> {

    override async initialize(state?: any) {
        Object.assign(this.descriptor, {
            identifier: MODULE_ID,
            name: "Event Monitor",
            vendor: "WamJamParty",
            description: "Receives WAM events and forwards them to the 3D log panel",
            version: "1.0.0",
            apiVersion: "2.0.0",
        });
        return super.initialize(state);
    }

    override async createAudioNode(initialState?: any): Promise<WamNode> {
        await EventMonitorNode.addModules(this.audioContext, this.moduleId);
        const node = new EventMonitorNode(this, {});
        await node._initialize();
        if (initialState !== undefined) await node.setState(initialState);
        return node;
    }
}

/** Creates the monitor WAM inside the host group and returns its node. */
export async function createEventMonitorNode(groupId: string, audioCtx: AudioContext): Promise<IWamNode> {
    const wam = await EventMonitorWam.createInstance(groupId, audioCtx);
    return wam.audioNode as unknown as IWamNode;
}
