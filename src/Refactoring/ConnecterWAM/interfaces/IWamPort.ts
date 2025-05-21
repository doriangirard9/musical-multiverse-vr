import {WamNode} from "@webaudiomodules/api";
import {PortType} from "./EnumConnexionType.ts";

export interface IWamPort {
    type : PortType
    id : string
    node : WamNode

    connect(dst : IWamPort): void
    disconnect(dst : IWamPort): void
}