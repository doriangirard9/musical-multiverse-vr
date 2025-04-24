import {IWamConnectionStrategy} from "./interfaces/IWamConnectionStrategy.ts";
import {WamNode} from "@webaudiomodules/api";

export class MidiConnectionStrategy implements IWamConnectionStrategy {
    connect(src: WamNode, dst: WamNode): void {
        src.connectEvents(dst.instanceId)
    }

    disconnect(src: WamNode, dst: WamNode): void {
        src.disconnectEvents(dst.instanceId)
    }

    canHandle(src: PortType, dst: PortType): boolean {
        return src === PortType.MIDI_OUTPUT && dst === PortType.MIDI_INPUT;
    }
}