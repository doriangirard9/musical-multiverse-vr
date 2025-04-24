import {IWamPort} from "./interfaces/IWamPort.ts";
import {WamConnectionRegistry} from "./WamConnectionRegistry.ts";
import {WamNode} from "@webaudiomodules/api";

export class WamConnectionPort implements IWamPort {
    id: string;
    node: WamNode;
    type: PortType;

    constructor(type: PortType, id: string, node: WamNode) {
        this.node = node;
        this.id = id;
        this.type = type;
    }

    connect(dst: IWamPort): void {
        const strategy = WamConnectionRegistry.getInstance().getStrategy(this.type, dst.type);
        // Une erreur est throw dans getStrategy si aucune stratégie n'est trouvée
        if (strategy) {
            strategy.connect(this.node, dst.node);
        }
    }

    disconnect(dst: IWamPort): void {
        const strategy = WamConnectionRegistry.getInstance().getStrategy(this.type, dst.type);
        // Une erreur est throw dans getStrategy si aucune stratégie n'est trouvée
        if (strategy) {
            strategy.disconnect(this.node, dst.node);
        }
    }

}