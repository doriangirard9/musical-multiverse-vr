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
        meshes: AbstractMesh[],
        highlightLayer: HighlightLayer,
        node3d: AudioNode3D
    ) {
        const disposes: (()=>void)[] = []

        let hovered = false

        function hover(){
            if(!hovered) {
                hovered = true
                for(const mesh of meshes) NodeCompUtils.highlight(highlightLayer, mesh, color)
            }
        }

        function unhover(){
            if(hovered) {
                hovered = false
                for(const mesh of meshes) NodeCompUtils.unhighlight(highlightLayer, mesh)
            }
        }

        function onleftpick(){
            node3d.ioObservable.notifyObservers({ type, pickType: 'down', node: node3d });
        }

        function onpickup(){
            node3d.ioObservable.notifyObservers({ type, pickType: 'up', node: node3d });
        }

        function onpickout(){
            node3d.ioObservable.notifyObservers({ type, pickType: 'out', node: node3d });
        }
        

        for(const mesh of meshes) {
            const action = mesh.actionManager ??= new ActionManager(mesh.getScene())
        
            const _onover = action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, hover))!!
            const _onout = action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, unhover))!!
            
            const _onleftpick = action.registerAction(new ExecuteCodeAction(ActionManager.OnLeftPickTrigger, onleftpick))!!
            const _onpickup = action.registerAction(new ExecuteCodeAction(ActionManager.OnPickUpTrigger, onpickup))!!
            const _onpickout = action.registerAction(new ExecuteCodeAction(ActionManager.OnPickOutTrigger, onpickout))!!

            disposes.push(() => {
                action.unregisterAction(_onover)
                action.unregisterAction(_onout)
                action.unregisterAction(_onleftpick)
                action.unregisterAction(_onpickup)
                action.unregisterAction(_onpickout)
                unhover()
            })
        }

        this.dispose = ()=> disposes.forEach(d => d())
    }

    declare dispose: () => void

}