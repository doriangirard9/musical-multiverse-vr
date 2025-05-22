import {WamNode} from "@webaudiomodules/api";
import { PortType } from "./EnumConnexionType";

export interface IWamConnectionStrategy {
    connect(src: WamNode|AudioNode, dst: WamNode|AudioNode): void;
    disconnect(src: WamNode|AudioNode, dst: WamNode|AudioNode): void;
    canHandle(src: PortType, dst: PortType): boolean;
}
