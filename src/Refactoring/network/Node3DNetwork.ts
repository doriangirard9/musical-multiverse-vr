import * as Y from 'yjs';
import { N3DConnectionInstance } from '../ConnecterWAM/node3d/instance/N3DConnectionInstance.ts';
import { SceneManager } from '../app/SceneManager.ts';
import { Node3DInstance } from '../ConnecterWAM/node3d/instance/Node3DInstance.ts';
import { Node3dManager } from '../app/Node3dManager.ts';
import { UIManager } from '../app/UIManager.ts';

/**
 * Composant gérant les nœuds audio et leurs états.
 * Responsable de la synchronisation des états des nœuds audio via Y.js.
 */
export class Node3DNetwork {

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

        console.log(`[AudioNodeComponent] Initialized`);
    }

}