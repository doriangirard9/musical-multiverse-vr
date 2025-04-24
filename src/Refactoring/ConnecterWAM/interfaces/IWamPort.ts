import {WamNode} from "@webaudiomodules/api";

export interface IWamPort {
    type : PortType
    id : string
    node : WamNode

    connect(dst : IWamPort): void
    disconnect(dst : IWamPort): void
}