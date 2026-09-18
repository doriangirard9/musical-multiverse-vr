import { HighlightLayer, Observable, UtilityLayerRenderer } from "@babylonjs/core";
import { IOEventBus } from "../../eventBus/IOEventBus";
import { PointerInput } from "../../xr/inputs/PointerInput";
import { InputDropBehavior } from "../../xr/inputs/tools/InputDropBehavior";
import { InputGrabBehavior } from "../../xr/inputs/tools/InputGrabBehavior";
import { InputMultiHoverBehavior } from "../../xr/inputs/tools/InputMultiHoverBehavior";
import { N3DInteractions } from "./N3DInteractions"
import { Node3DConnectable } from "../Node3DConnectable";
import { NodeCompUtils } from "../tools/utils/NodeCompUtils";
import { N3DConnectionInstance } from "./N3DConnectionInstance";
import { Node3DInstance } from "./Node3DInstance";
import { N3DText } from "./utils/N3DText";

/**
 * A simple connection node that is used to connect to other nodes.
 */
export class N3DConnectableInstance {

    public connections = new Set<N3DConnectionInstance>()

    /** Notified on disposal of this connectable. */
    public readonly onDispose = new Observable<void>()

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
        utilityLayer: UtilityLayerRenderer,
        ioEventBus: IOEventBus,
        targetOnly: boolean = false,
        hoveringHelp: boolean = true
    ) {
        const disposes: (()=>void)[] = []

        let hovered = false

        const {color, meshes} = config

        const connectable = this

        const text = new N3DText(`text ${config.id}`, config.meshes, utilityLayer.utilityLayerScene)
        text.set(config.label)

        function hover(){
            if(!hovered) {
                hovered = true
                text.show()
                text.updatePosition()
                for(const mesh of meshes) NodeCompUtils.highlight(highlightLayer, mesh, color)
            }
        }

        function unhover(){
            if(hovered) {
                hovered = false
                text.hide()
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

        // The capability is asked per pointer: a hand whose tool did not ask for the connections
        // neither takes a link from the port nor drops one on it, while the other hand still does.
        const connections = N3DInteractions.connections

        for(const mesh of meshes) {
            mesh.metadata = mesh.metadata || {}
            mesh.metadata.isConnectablePort = true

            if(!targetOnly){
                let grabbing = false
                const grab = new InputGrabBehavior(
                    pointer => {
                        if(!connections.isEnabledFor(pointer)) return
                        grabbing = true
                        onpickdown(pointer)
                    },
                    pointer => {
                        if(!grabbing) return
                        grabbing = false
                        onpickout(pointer)
                    },
                    undefined,
                    connections,
                )

                mesh.addBehavior(grab)

                disposes.push(()=>{
                    mesh.removeBehavior(grab)
                })
            }

            const drop = new InputDropBehavior(pointer => {
                if(connections.isEnabledFor(pointer)) onpickup(pointer)
            }, connections)
            mesh.addBehavior(drop)

            disposes.push(()=>{
                mesh.removeBehavior(drop)
            })


            if(hoveringHelp){
                const hovering = new Set<PointerInput>()
                const hoverb = new InputMultiHoverBehavior(
                    pointer => {
                        if(!connections.isEnabledFor(pointer)) return
                        hovering.add(pointer)
                        hover()
                    },
                    pointer => {
                        if(!hovering.delete(pointer)) return
                        if(hovering.size===0) unhover()
                    },
                    connections,
                )
                mesh.addBehavior(hoverb)
                disposes.push(() => {
                    mesh.removeBehavior(hoverb)
                })
            }
            
        }

        this.dispose = ()=>{
            this.onDispose.notifyObservers()
            this.connections.forEach(c => c.remove())
            disposes.forEach(d => d())
            text.dispose()
        }
    }

    declare dispose: () => void

    /**
     * Why a link between this port and the other one would be refused, or null when it would be accepted.
     *
     * @remarks
     * The single place where the conditions of a link live. It answers with the reason rather than with a
     * boolean so that the one place that creates links can show it to the player, while everything that
     * merely asks the question, a hand trying every port against every port for instance, just tests it
     * against null and stays silent.
     *
     * Two ports of the same module are not refused here: whether a module may be wired onto itself is the
     * business of whoever asks, not of the ports.
     */
    canConnectTo(other: N3DConnectableInstance): string | null {
        if(this === other) return "Can't connect a node to itself"

        for(const connection of this.connections){
            if(connection.inputConnectable === other || connection.outputConnectable === other){
                return `Already connected to ${other.config.label}`
            }
        }

        if(this.connections.size >= (this.config.max_connections ?? Number.MAX_SAFE_INTEGER)){
            return `The first connectable already have the maximum number of connection`
        }

        if(other.connections.size >= (other.config.max_connections ?? Number.MAX_SAFE_INTEGER)){
            return `The second connectable already have the maximum number of connection`
        }

        const directions = [this.config.direction, other.config.direction]
        if(!directions.includes("bidirectional") && this.config.direction === other.config.direction){
            return `Cannot connect a ${this.config.direction} port to a ${other.config.direction} port`
        }

        if(this.config.type !== other.config.type){
            return `Can't connect a ${this.config.type} to a ${other.config.type}`
        }

        return null
    }

}