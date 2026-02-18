import { ActionManager, ExecuteCodeAction, HighlightLayer } from "@babylonjs/core";
import { NodeCompUtils } from "../tools/utils/NodeCompUtils";
import { Node3DConnectable } from "../Node3DConnectable";
import { Node3DInstance } from "./Node3DInstance";
import { IOEventBus } from "../../eventBus/IOEventBus";
import { N3DConnectionInstance } from "./N3DConnectionInstance";
import { InputHoverBehavior } from "../../xr/inputs/tools/InputHoverBehavior";
import { InputGrabBehavior } from "../../xr/inputs/tools/InputGrabBehavior";
import { PointerInput } from "../../xr/inputs/PointerInput";
import { InputDropBehavior } from "../../xr/inputs/tools/InputDropBehavior";

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
        targetOnly: boolean = false,
        hoveringHelp: boolean = true
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

        function onpickdown(pointer: PointerInput){
            ioEventBus.emit('IO_CONNECT', { pickType : "down", connectable, pointer })
        }

        function onpickup(pointer: PointerInput){
            ioEventBus.emit('IO_CONNECT', { pickType : "up", connectable, pointer })
        }

        function onpickout(pointer: PointerInput){
            ioEventBus.emit('IO_CONNECT', { pickType : "out", connectable, pointer })
        }

        for(const mesh of meshes) {
            if(!targetOnly){
                const grab = new InputGrabBehavior(
                    pointer => onpickdown(pointer),
                    pointer => {
                        onpickout(pointer)
                    },
                )

                const drop = new InputDropBehavior((pointer)=>{
                    console.log("drop", config.label)
                    onpickup(pointer)
                })

                mesh.addBehavior(grab).addBehavior(drop)

                disposes.push(()=>{
                    mesh.removeBehavior(grab).removeBehavior(drop)
                })
            }

            if(hoveringHelp){
                const hoverb = new InputHoverBehavior(hover, unhover)
                mesh.addBehavior(hoverb)
                disposes.push(() => {
                    mesh.removeBehavior(hoverb)
                })
            }
            
        }

        this.dispose = ()=>{
            this.connections.forEach(c => c.remove())
            disposes.forEach(d => d())
        }
    }

    declare dispose: () => void

}