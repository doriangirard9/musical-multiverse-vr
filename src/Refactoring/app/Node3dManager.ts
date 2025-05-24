import { AudioNode3D } from "../ConnecterWAM/AudioNode3D.ts";
import { Node3DInstance } from "../ConnecterWAM/node3d/instance/Node3DInstance.ts";
import { RandomUtils } from "../ConnecterWAM/node3d/tools/utils/RandomUtils.ts";
import { AudioEventBus } from "../eventBus/AudioEventBus.ts";
import { NetworkManager } from "../network/NetworkManager.ts";
import { Node3DBuilder as Node3DBuilder } from "./Node3DBuilder.ts";

export class Node3dManager {

    readonly builder: Node3DBuilder;
    private audioEventBus: AudioEventBus;

    private constructor(private audioCtx: AudioContext) {
        this.builder = new Node3DBuilder(audioCtx);
        this.audioEventBus = AudioEventBus.getInstance();
    }

    private static _instance: Node3dManager | null = null;

    public static getInstance(audioCtx?: AudioContext): Node3dManager {
        if (!Node3dManager._instance) {
            if (!audioCtx) {
                throw new Error("Scene and AudioContext are required for first instantiation");
            }
            Node3dManager._instance = new Node3dManager(audioCtx);
        }
        return Node3dManager._instance;
    }

    public async createNode3d(kind: string, id?: string): Promise<Node3DInstance|null>{
        const nodeId = id ?? RandomUtils.randomID()

        const node = await this.builder.create(kind)
        if(node instanceof AudioNode3D){
            NetworkManager.getInstance().node3d.nodes.add(nodeId, node, kind)
            this.audioEventBus.emit("AUDIO_NODE_LOADED",{nodeId, kind, instance:node})
            return node
        }
        else{
            this.audioEventBus.emit("AUDIO_NODE_ERROR",{nodeId, kind, error_message:node})
            return null
        }
    }

    public getAudioContext(): AudioContext {
        return this.audioCtx;
    }


}