import {IWamConnectionStrategy} from "./interfaces/IWamConnectionStrategy.ts";
import {WamNode} from "@webaudiomodules/api";

export class AudioConnectionStrategy implements IWamConnectionStrategy {
    public connect(src: WamNode, dst: WamNode): void {
        src.connect(dst);
    }

    public disconnect(src: WamNode, dst: WamNode): void {
        src.disconnect(dst);
    }

    public canHandle(src: PortType, dst: PortType): boolean {
        return src === PortType.AUDIO_OUTPUT && dst === PortType.AUDIO_INPUT;
    }
}