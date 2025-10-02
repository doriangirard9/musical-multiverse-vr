import * as Y from 'yjs';
import { SceneManager } from '../app/SceneManager.ts';
import { VisualTube } from '../visual/VisualTube.ts';

/**
 * Composant gérant les nœuds audio et leurs états.
 * Responsable de la synchronisation des états des nœuds audio via Y.js.
 */
export class VisualNetwork {

    /**
     * Le gestionnaire des visuels de tube
     */
    readonly tubes

    constructor(
        readonly doc: Y.Doc
    ) {

        const scene = SceneManager.getInstance().getScene()

        this.tubes = VisualTube.getSyncManager(scene,doc)

        console.log(`[VisualNetwork] Initialized`);
    }

}