import * as Y from 'yjs';
import { N3DConnectionInstance } from '../node3d/instance/N3DConnectionInstance.ts';
import { SceneManager } from '../app/SceneManager.ts';
import { Node3DInstance } from '../node3d/instance/Node3DInstance.ts';
import { Node3dManager } from '../app/Node3dManager.ts';
import { UIManager } from '../app/UIManager.ts';
import { SyncSerializable } from './sync/SyncSerializable.ts';
import { Quaternion, Vector3 } from '@babylonjs/core';

/**
 * Composant gérant les nœuds audio et leurs états.
 * Responsable de la synchronisation des états des nœuds audio via Y.js.
 */
export class Node3DNetwork {
    private static readonly DEBUG_LOG = false;

    /**
     * Le gestionnaire de Node3D
     */
    readonly nodes

    /**
     * Le gestionnaire de connections entre les Node3D
     */
    readonly connections

    constructor(
        readonly doc: Y.Doc
    ) {

        const scene = SceneManager.getInstance().getScene()

        this.nodes = Node3DInstance.getSyncManager(
            scene,
            doc,
            Node3dManager.getInstance(),
            UIManager.getInstance(),
        )

        this.connections = N3DConnectionInstance.getSyncManager(
            scene,
            doc,
            this.nodes,
            UIManager.getInstance(),
        )

        if (Node3DNetwork.DEBUG_LOG) console.log(`[AudioNodeComponent] Initialized`);
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