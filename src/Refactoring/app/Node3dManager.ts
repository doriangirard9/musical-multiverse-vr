import { Node3DInstance } from "../node3d/instance/Node3DInstance.ts";
import { RandomUtils } from "../node3d/tools/utils/RandomUtils.ts";
import { AudioEventBus } from "../eventBus/AudioEventBus.ts";
import { NetworkManager } from "../network/NetworkManager.ts";
import { Node3DBuilder as Node3DBuilder } from "./Node3DBuilder.ts";
import { AudioEngineV2 } from "@babylonjs/core";

export class Node3dManager {

    readonly builder: Node3DBuilder;
    private audioEventBus: AudioEventBus;

    private constructor(private audioCtx: AudioContext, private audioEngine: AudioEngineV2) {
        this.builder = new Node3DBuilder();
        this.audioEventBus = AudioEventBus.getInstance();
    }

    private static _instance: Node3dManager | null = null;

    public static async initialize(audioCtx: AudioContext, audioEngine: AudioEngineV2): Promise<void> {
        this._instance = new Node3dManager(audioCtx, audioEngine)
        await this._instance.builder.initialize()
    }

    public static getInstance(audioCtx?: AudioContext, audioEngine?: AudioEngineV2): Node3dManager {
        if (!this._instance) throw new Error("Node3dManager not initialized. Call initialize() first.")
        return this._instance
    }

    public async createNode3d(kind: string, id?: string): Promise<Node3DInstance|null>{
        const nodeId = id ?? RandomUtils.randomID()

        this.audioEventBus.emit("AUDIO_NODE_CREATED",{nodeId, kind})
        const node = await this.builder.create(kind)
        if(node instanceof Node3DInstance){
            await NetworkManager.getInstance().node3d.nodes.add(nodeId, node, kind)
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

    public getAudioEngine(): AudioEngineV2 {
        return this.audioEngine
    }

}