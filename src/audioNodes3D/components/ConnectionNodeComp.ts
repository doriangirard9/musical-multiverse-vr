import { AbstractMesh, ActionManager, Color3, ExecuteCodeAction, HighlightLayer } from "@babylonjs/core";
import { IOEvent } from "../../types";
import { AudioNode3D } from "../AudioNode3D";
import { NodeCompUtils } from "./NodeCompUtils";

/**
 * A simple connection node that is used to connect to other nodes.
 */
export class ConnectionNodeComp {

    /**
     * 
     * @param color The highlight color of the connection node.
     * @param type The type of the connection node.
     * @param mesh The mesh of the connection node, which is highlighted and draggable.
     * @param highlightLayer The highlight layer used to highlight the connection node.
     * @param node3d The AudioNode3D that this connection node belongs to.
     */
    constructor(
        color: Color3,
        type: IOEvent['type'],
        mesh: AbstractMesh,
        highlightLayer: HighlightLayer,
        node3d: AudioNode3D
    ) {
        const action = mesh.actionManager ??= new ActionManager(mesh.getScene())
        
        const onover = action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
            NodeCompUtils.highlight(highlightLayer, mesh, color)
        }))!!
        const onout = action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
            NodeCompUtils.unhighlight(highlightLayer, mesh)
        }))!!
        
        const onleftpick = action.registerAction(new ExecuteCodeAction(ActionManager.OnLeftPickTrigger, () => {
            node3d.ioObservable.notifyObservers({ type, pickType: 'down', node: node3d });
        }))!!
        const onpickup = action.registerAction(new ExecuteCodeAction(ActionManager.OnPickUpTrigger, () => {
            node3d.ioObservable.notifyObservers({ type, pickType: 'up', node: node3d });
        }))!!
        const onpickout = action.registerAction(new ExecuteCodeAction(ActionManager.OnPickOutTrigger, () => {
            node3d.ioObservable.notifyObservers({ type, pickType: 'out', node: node3d });
        }))!!

        this.dispose = () => {
            action.unregisterAction(onover)
            action.unregisterAction(onout)
            action.unregisterAction(onleftpick)
            action.unregisterAction(onpickup)
            action.unregisterAction(onpickout)
            NodeCompUtils.unhighlight(highlightLayer, mesh)
        }
    }

    declare dispose: () => void

}