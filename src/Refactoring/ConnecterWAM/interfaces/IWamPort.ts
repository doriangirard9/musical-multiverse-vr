import {WamNode} from "@webaudiomodules/api";
import {PortType} from "./EnumConnexionType.ts";

export interface IWamPort {
    type : PortType
    id : 'audioIn' | 'audioOut' | 'midiIn' | 'midiOut'
    node : WamNode|AudioNode
    connect(dst : IWamPort): void
    disconnect(dst : IWamPort): void
}