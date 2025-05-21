import {WamNode} from "@webaudiomodules/api";

export interface IWamConnectionStrategy {
    connect(src: WamNode, dst: WamNode): void;
    disconnect(src: WamNode, dst: WamNode): void;
    canHandle(src: PortType, dst: PortType): boolean;
}
