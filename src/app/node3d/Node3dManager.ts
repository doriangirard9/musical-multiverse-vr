import { Node3DInstance } from "../../node3d/instance/Node3DInstance.ts";
import { N3DConnectionInstance } from "../../node3d/instance/N3DConnectionInstance.ts";
import { N3DParameterInstance } from "../../node3d/instance/N3DParameterInstance.ts";
import { N3DButtonInstance } from "../../node3d/instance/N3DButtonInstance.ts";
import { PointerInput } from "../../xr/inputs/PointerInput.ts";
import { RandomUtils } from "../../node3d/tools/utils/RandomUtils.ts";
import { NetworkManager } from "../../network/NetworkManager.ts";
import { Node3DBuilder as Node3DBuilder } from "./Node3DBuilder.ts";
import { AudioEngineV2, CreateBox, Observable, Vector3 } from "@babylonjs/core";
import { AsyncLoading } from "../../world/AsyncLoading.ts";
import { SceneManager } from "../SceneManager.ts";
import { HoldableBehaviour } from "../../behaviours/boundingBox/HoldableBehaviour.ts";

/**
 * Handle the addition and management of the 3D nodes in the world.
 * The creation of Node3D is the responsibility of the {@link Node3DBuilder},
 * but the Node3DManager is responsible for adding them to the world and to
 * the network, and for keeping track of them.
 */
export class Node3dManager {

    readonly builder: Node3DBuilder

    private constructor(
        private audioCtx: AudioContext,
        private audioEngine: AudioEngineV2
    ) {
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

    public async addNode3d(kind: string, position: Vector3, id?: string): Promise<Node3DInstance|null>{
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

    //// WHAT THE HANDS TAKE AND LET GO ////
    /**
     * Everything the hands take hold of in the world, said once, wherever it happens.
     *
     * @remarks
     * Every instance tells its own holds: {@link Node3DInstance.onGrab}, and the same pair on
     * connections, parameters and buttons. A tool interested in all of them would have to follow
     * every instance as it appears and disappears, so that following is done here, once.
     *
     * A hold is told with the pointers holding it, never with a controller nor a hand: that is what
     * lets a tool keep only what its own pointer does, and what makes a two handed hold one hold.
     * Told by the instance rather than guessed from a trigger, so a node taken by another road than
     * the ray of the tool, or let go because a hand lost the right to hold it, is known just the same.
     */
    get onNodeGrabbed(){ this.#watch(); return this.#onNodeGrabbed }
    get onNodeReleased(){ this.#watch(); return this.#onNodeReleased }

    get onConnectionGrabbed(){ this.#watch(); return this.#onConnectionGrabbed }
    get onConnectionReleased(){ this.#watch(); return this.#onConnectionReleased }

    get onParameterGrabbed(){ this.#watch(); return this.#onParameterGrabbed }
    get onParameterReleased(){ this.#watch(); return this.#onParameterReleased }

    get onButtonGrabbed(){ this.#watch(); return this.#onButtonGrabbed }
    get onButtonReleased(){ this.#watch(); return this.#onButtonReleased }

    readonly #onNodeGrabbed = new Observable<{node: Node3DInstance, pointers: PointerInput[]}>()
    readonly #onNodeReleased = new Observable<{node: Node3DInstance, pointers: PointerInput[]}>()

    readonly #onConnectionGrabbed = new Observable<{connection: N3DConnectionInstance, pointers: PointerInput[]}>()
    readonly #onConnectionReleased = new Observable<{connection: N3DConnectionInstance, pointers: PointerInput[]}>()

    readonly #onParameterGrabbed = new Observable<{node: Node3DInstance, parameter: N3DParameterInstance, pointers: PointerInput[]}>()
    readonly #onParameterReleased = new Observable<{node: Node3DInstance, parameter: N3DParameterInstance, pointers: PointerInput[]}>()

    readonly #onButtonGrabbed = new Observable<{node: Node3DInstance, button: N3DButtonInstance, pointers: PointerInput[]}>()
    readonly #onButtonReleased = new Observable<{node: Node3DInstance, button: N3DButtonInstance, pointers: PointerInput[]}>()

    #watching = false

    /**
     * Start following what appears in the world, once and once only.
     *
     * @remarks
     * Not done at construction: the manager is built before the network, and the network asks for
     * the manager while it is building itself. So the following starts the first time somebody
     * wants to hear about it, and there is no wiring line to forget elsewhere.
     */
    #watch(): void {
        if(this.#watching) return
        this.#watching = true

        const registry = NetworkManager.getInstance().node3d

        const followNode = (node: Node3DInstance) => {
            const observers = [
                node.onGrab.add(pointers => this.#onNodeGrabbed.notifyObservers({node, pointers})),
                node.onRelease.add(pointers => this.#onNodeReleased.notifyObservers({node, pointers})),
                node.onParameterCreated.add(({parameter}) => followParameter(node, parameter)),
                node.onButtonCreated.add(button => followButton(node, button)),
            ]
            for(const parameter of node.parameters.values()) followParameter(node, parameter)
            for(const button of node.buttons.values()) followButton(node, button)
            node.onDispose.addOnce(() => observers.forEach(it => it.remove()))
        }

        const followParameter = (node: Node3DInstance, parameter: N3DParameterInstance) => {
            parameter.onGrab.add(pointers => this.#onParameterGrabbed.notifyObservers({node, parameter, pointers}))
            parameter.onRelease.add(pointers => this.#onParameterReleased.notifyObservers({node, parameter, pointers}))
        }

        const followButton = (node: Node3DInstance, button: N3DButtonInstance) => {
            button.onGrab.add(pointers => this.#onButtonGrabbed.notifyObservers({node, button, pointers}))
            button.onRelease.add(pointers => this.#onButtonReleased.notifyObservers({node, button, pointers}))
        }

        const followConnection = (connection: N3DConnectionInstance) => {
            const observers = [
                connection.onGrab.add(pointers => this.#onConnectionGrabbed.notifyObservers({connection, pointers})),
                connection.onRelease.add(pointers => this.#onConnectionReleased.notifyObservers({connection, pointers})),
            ]
            connection.onDispose.addOnce(() => observers.forEach(it => it.remove()))
        }

        // What is already there, and what comes later, by the same road.
        for(const [, node] of registry.nodes.entries()) followNode(node)
        for(const [, connection] of registry.connections.entries()) followConnection(connection)
        registry.onNodeAdded.add(followNode)
        registry.onConnectionAdded.add(followConnection)
    }


    public getAudioContext(): AudioContext {
        return this.audioCtx;
    }

    public getAudioEngine(): AudioEngineV2 {
        return this.audioEngine
    }

    public getRegistry(){
        return NetworkManager.getInstance().node3d
    }

}