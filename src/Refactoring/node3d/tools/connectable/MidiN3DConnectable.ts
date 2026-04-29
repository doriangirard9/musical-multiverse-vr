import { AbstractMesh, Color3 } from "@babylonjs/core";
import { Node3DConnectable } from "../../Node3DConnectable";
import { WamNode } from "@webaudiomodules/api";

/**
 * Protocol "midi" des connectable.
 * Connection retournée par DynamicInput.connectAsInput().
 * Permet aux outputs de s'enregistrer pour être notifiés des changements de WamNode.
 */
export interface MidiN3DConnection {
    /** S'enregistrer comme observeur pour être notifié des changements de WamNode */
    subscribe(observer: (old:WamNode|null, now:WamNode|null)=>void): void

    /** Se désabonner des notifications. Doit être appelé avec le même observer que subscribe. */
    unsubscribe(observer: (old:WamNode|null, now:WamNode|null)=>void): void
}

/**
 * Simple implementations of Node3DConnectable for the "midi" protocol.
 */
export namespace MidiN3DConnectable{

    export const Color = Color3.FromHexString("#33BB88")

    /**
     * A input connectable that connect an WamNode.
     */
    export class Input implements Node3DConnectable {

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly wamNode: WamNode,
        ){}

        get type(){ return "midi" }

        get direction(){ return "input" as "input" }

        get color(){ return Color }

        connectAsInput(): MidiN3DConnection {
            const that = this
            return {
                subscribe(observer: (old:WamNode|null,now:WamNode|null)=>void) {
                    observer(null, that.wamNode)
                },
                unsubscribe(observer: (old:WamNode|null,now:WamNode|null)=>void) {
                    observer(that.wamNode, null)
                }
            }
        }

        disconnectAsInput(_: any): void { }
        connectAsOutput(_: any): void { }
        disconnectAsOutput(_: any): void { }
    }

    /**
     * A input connectable that connect an WamNode, its wam node can be changed at any time.
     * It can also contains no wam node.
     */
    export class DynamicInput implements Node3DConnectable {

        private _wamNode: WamNode|null = null
        private listeners = new Set<(old:WamNode|null, now:WamNode|null)=>void>()

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            wamNode: WamNode|null,
        ){
            this.wamNode = wamNode
        }

        get type(){ return "midi" }

        get direction(){ return "input" as "input" }

        get color(){ return Color }

        connectAsInput(): MidiN3DConnection {
            const that = this
            return {
                subscribe(observer) {
                    observer(null, that._wamNode)
                    that.listeners.add(observer)
                },
                unsubscribe(observer) {
                    observer(that._wamNode, null)
                    that.listeners.delete(observer)
                },
            }
        }

        disconnectAsInput(_: any): void { }
        connectAsOutput(_: any): void { }
        disconnectAsOutput(_: any): void { }

        set wamNode(wamNode: WamNode|null){
            const old = this._wamNode
            this._wamNode = wamNode
            for(const listener of this.listeners){
                listener(old, wamNode)
            }
        }
    }

    /**
     * A output connectable that connect an WamNode.
     */
    export class Output implements Node3DConnectable {

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly wamNode: WamNode,
        ){}

        get type(){ return "midi" }

        get direction(){ return "output" as "output" }

        get color(){ return Color }

        private callback = (old:WamNode|null, now:WamNode|null) => {
            if(old) {
                this.wamNode.disconnectEvents(old.instanceId)
                window.WAMExtensions.notes?.addMapping(this.wamNode.instanceId)
            }
            if(now) {
                this.wamNode.connectEvents(now.instanceId)
                window.WAMExtensions.notes?.addMapping(this.wamNode.instanceId, [now.instanceId])
            }
        }

        connectAsOutput(connection: MidiN3DConnection): void {
            connection.subscribe(this.callback)
        }

        disconnectAsOutput(connection: MidiN3DConnection): void {
            connection.unsubscribe(this.callback)
        }

        connectAsInput() { }
        disconnectAsInput(_: any) { }
    }
    
    /**
     * A output connectable that keep a list of the wam nodes connected to it.
     */
    export class ListOutput implements Node3DConnectable {

        readonly connections: WamNode[] = []

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            /** A callback called when a new connection is added to the list. */
            readonly on_add: (wamNode:WamNode) => void = ()=>{},
            /** A callback called when a connection is removed from the list. */
            readonly on_remove: (wamNode:WamNode) => void = ()=>{},
        ){}

        get type(){ return "midi" }

        get direction(){ return "output" as "output" }

        get color(){ return Color }

        private callback = (old:WamNode|null, now:WamNode|null) => {
            if(old){
                const index = this.connections.indexOf(old)
                if(index !== -1){
                    this.connections.splice(index, 1)
                    this.on_remove(old)
                }
            }
            if(now){
                this.connections.push(now)
                this.on_add(now)
            }
        }

        connectAsOutput(connection: MidiN3DConnection): void {
            connection.subscribe(this.callback)
        }

        connectAsInput(): any { return {} }
        disconnectAsInput(_: any): void { }

        disconnectAsOutput(_: any): void { }
    }

    /**
     * A output connectable that connect an WamNode, its wam node can be changed at any time.
     * It can also contains no wam node.
     */
    export class DynamicOutput extends ListOutput {

        private _wamNode: WamNode|null = null

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            wamNode: WamNode|null,
        ){
            super(
                id, meshes, label,
                (n) => {
                    if(this._wamNode) {
                        this._wamNode.connectEvents(n.instanceId)
                        window.WAMExtensions.notes?.addMapping(this._wamNode.instanceId, [n.instanceId])
                    }
                },
                (n) => {
                    if(this._wamNode) {
                        this._wamNode.disconnectEvents(n.instanceId)
                        window.WAMExtensions.notes?.addMapping(this._wamNode.instanceId)
                    }
                }
            )
            this._wamNode = wamNode
        }

        set wamNode(wamNode: WamNode|null){
            if(this._wamNode!=null){
                for(const node of this.connections){
                    this.on_remove(node)
                }
            }
            this._wamNode = wamNode
            if(this._wamNode){
                for(const node of this.connections){
                    this.on_add(node)
                }
            }
        }
    }
}