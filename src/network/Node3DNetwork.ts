import * as Y from 'yjs';
import { N3DConnectionInstance } from '../node3d/instance/N3DConnectionInstance.ts';
import { SceneManager } from '../app/SceneManager.ts';
import { Node3DInstance } from '../node3d/instance/Node3DInstance.ts';
import { Node3dManager } from '../app/node3d/Node3dManager.ts';
import { SyncSerializable } from './sync/SyncSerializable.ts';
import { SyncManager } from './sync/SyncManager.ts';
import { Observable } from '@babylonjs/core';
import { MenuSystem } from '../app/menu/MenuSystem.ts';
import { NetworkRoom } from './NetworkRoom.ts';

/**
 * Composant gérant les nœuds audio et leurs états.
 * Responsable de la synchronisation des états des nœuds audio via Y.js.
 */
export class Node3DNetwork {
    private static readonly DEBUG_LOG = false;

    /**
     * Le gestionnaire de Node3D
     */
    nodes!: SyncManager<Node3DInstance, string>
    readonly onNodeAdded = new Observable<Node3DInstance>()
    readonly onNodeRemoved = new Observable<Node3DInstance>()

    /**
     * Le gestionnaire de connections entre les Node3D
     */
    connections!: SyncManager<N3DConnectionInstance, any>
    readonly onConnectionAdded = new Observable<N3DConnectionInstance>()
    readonly onConnectionRemoved = new Observable<N3DConnectionInstance>()

    constructor(
        readonly room: NetworkRoom
    ) {

    }

    /** Creates the managers, the connections after the nodes they link. */
    async initialize() {
        const doc = this.room.doc
        const scene = SceneManager.getInstance().getScene()

        this.nodes = await Node3DInstance.getSyncManager(
            doc,
            Node3dManager.getInstance(),
            instance => {
                this.onNodeAdded.notifyObservers(instance)
                instance._onMessage = message => {
                    this.room.broadcast({
                        node3dtarget: this.nodes.getId(instance),
                        message: message
                    })
                }
            },
            instance => this.onNodeRemoved.notifyObservers(instance),
        )

        this.connections = await N3DConnectionInstance.getSyncManager(
            scene,
            doc,
            this.nodes,
            MenuSystem.getInstance(),
            instance => this.onConnectionAdded.notifyObservers(instance),
            instance => this.onConnectionRemoved.notifyObservers(instance),
        )

        if (Node3DNetwork.DEBUG_LOG) console.log(`[AudioNodeComponent] Initialized`);

        // Send the messages
        this.room.onMessage.add(({ message, peer }) => {
            if(message == null || message == undefined) return
            if(typeof message != "object") return
            if(!("node3dtarget" in message)) return
            const id = message.node3dtarget as string
            const msg = (message as any)?.message
            this.nodes.getNow(id)?._sendMessage(msg)
        })
    }
}

export interface Node3DGraphDescription{
    nodes: {
        kind: string
        position: number[]
        rotation: number[]
        data: Record<string,SyncSerializable>
    }[],
    connections: {
        from: number
        to: number
        fromConnectable: string
        toConnectable: string
    }[],
}