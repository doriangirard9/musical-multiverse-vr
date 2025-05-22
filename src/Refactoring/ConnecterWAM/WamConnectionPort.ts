import {IWamPort} from "./interfaces/IWamPort.ts";
import {WamConnectionRegistry} from "./WamConnectionRegistry.ts";
import {WamNode} from "@webaudiomodules/api";
import {PortType} from "./interfaces/EnumConnexionType.ts";

export class WamConnectionPort implements IWamPort {
    id: 'audioIn' | 'audioOut' | 'midiIn' | 'midiOut';
    node: WamNode;
    type: PortType;

    constructor(type: PortType, id: 'audioIn' | 'audioOut' | 'midiIn' | 'midiOut', node: WamNode) {
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