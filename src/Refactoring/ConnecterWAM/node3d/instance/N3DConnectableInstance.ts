import { ActionManager, ExecuteCodeAction, HighlightLayer } from "@babylonjs/core";
import { NodeCompUtils } from "../tools/utils/NodeCompUtils";
import { Node3DConnectable } from "../Node3DConnectable";
import { Node3DInstance } from "./Node3DInstance";
import { IOEventBus } from "../../../eventBus/IOEventBus";
import { N3DConnectionInstance } from "./N3DConnectionInstance";

/**
 * A simple connection node that is used to connect to other nodes.
 */
export class N3DConnectableInstance {

    public connections = new Set<N3DConnectionInstance>()

    /**
     * 
     * @param color The highlight color of the connection node.
     * @param type The type of the connection node.
     * @param mesh The mesh of the connection node, which is highlighted and draggable.
     * @param highlightLayer The highlight layer used to highlight the connection node.
     * @param node3d The AudioNode3D that this connection node belongs to.
     */
    constructor(
        readonly instance: Node3DInstance,
        readonly config: Node3DConnectable,
        highlightLayer: HighlightLayer,
        ioEventBus: IOEventBus,
    ) {
        const disposes: (()=>void)[] = []

        let hovered = false

        const {color, meshes} = config

        const connectable = this

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
            ioEventBus.emit('IO_CONNECT', { pickType : "down", connectable })
        }

        function onpickup(){
            ioEventBus.emit('IO_CONNECT', { pickType : "up", connectable })
        }

        function onpickout(){
            ioEventBus.emit('IO_CONNECT', { pickType : "out", connectable })
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

        this.dispose = ()=>{
            this.connections.forEach(c => c.remove())
            disposes.forEach(d => d())
        }
    }

    declare dispose: () => void

}