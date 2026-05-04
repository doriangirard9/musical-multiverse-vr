import { Node3DInstance } from "../node3d/instance/Node3DInstance.ts";
import { RandomUtils } from "../node3d/tools/utils/RandomUtils.ts";
import { NetworkManager } from "../network/NetworkManager.ts";
import { Node3DBuilder as Node3DBuilder } from "./Node3DBuilder.ts";
import { AudioEngineV2, CreateBox, Vector3 } from "@babylonjs/core";
import { AsyncLoading } from "../world/AsyncLoading.ts";
import { SceneManager } from "./SceneManager.ts";
import { HoldableBehaviour } from "../behaviours/boundingBox/HoldableBehaviour.ts";

export class Node3dManager {

    readonly builder: Node3DBuilder;

    private constructor(private audioCtx: AudioContext, private audioEngine: AudioEngineV2) {
        this.builder = new Node3DBuilder()
    }

    private static _instance: Node3dManager | null = null;

    public static async initialize(audioCtx: AudioContext, audioEngine: AudioEngineV2): Promise<void> {
        this._instance = new Node3dManager(audioCtx, audioEngine)
        await this._instance.builder.initialize()
    }

    public static getInstance(): Node3dManager {
        if (!this._instance) throw new Error("Node3dManager not initialized. Call initialize() first.")
        return this._instance
    }

    public async createNode3d(kind: string, position: Vector3, id?: string): Promise<Node3DInstance|null>{
        const nodeId = id ?? RandomUtils.randomID()
        
        const initfactory = (async()=>{
           this.builder.getFactory(kind)
        })()

        const spawnNode3D = initfactory.then(async()=>{
            const node = await this.builder.create(kind)
            if(node instanceof Node3DInstance){
                node.boundingBoxMesh.setAbsolutePosition(position)
                await NetworkManager.getInstance().node3d.nodes.add(nodeId, node, kind)
                return node
            }
            else{
                throw new Error(`Error while creating Node3D of kind ${kind} with id ${nodeId}: ${node}`)
            }
        })

        const spawnImpostor = initfactory.then(async()=>{
            const impostor = await this.builder.createImpostor(kind)
            impostor?.setAbsolutePosition(position)
            return impostor
        })

        const all = (async()=>{
            const [impostor,node] = await Promise.allSettled([spawnImpostor, spawnNode3D])
            if(impostor.status=="fulfilled")impostor.value?.dispose()
            if(node.status=="rejected")throw node.reason
            return node.value
        })()

        const {root,promise} = AsyncLoading.create(SceneManager.getInstance().getScene(), all)
        
        // Movable bounding box
        {
            const bb = CreateBox("bb", {size: 1}, SceneManager.getInstance().getScene())
            bb.visibility = 0.1
            bb.addBehavior(new HoldableBehaviour(root))
            bb.parent = root

            promise.then(n=>{
                n?.boundingBoxMesh?.setAbsolutePosition(bb.absolutePosition)
                n?.updatePosition()
                bb.dispose()
            })
        }

        spawnImpostor.then(impostor=> root.addChild(impostor!))

        root.setAbsolutePosition(position)
        root.scaling.setAll(0.5)

        return await promise
    }

    public getAudioContext(): AudioContext {
        return this.audioCtx;
    }

    public getAudioEngine(): AudioEngineV2 {
        return this.audioEngine
    }

}