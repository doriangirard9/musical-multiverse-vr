import { AbstractMesh, Color3 } from "@babylonjs/core";
import { Node3DConnectable } from "../../Node3DConnectable";

/**
 * Simple implementations of Node3DConnectable for the "audio" protocol.
 */
export namespace AudioN3DConnectable{

    export const Color = Color3.FromHexString("#00FF00")

    /**
     * Protocol "audio" des connectable.
     * Connection retournée par DynamicInput.connectAsInput().
     * Permet aux outputs de s'enregistrer pour être notifiés des changements d'audioNode.
     */
    export interface AudioN3DConnection {
        /** S'enregistrer comme observeur pour être notifié des changements d'audioNode */
        subscribe(observer: (old:AudioNode|null, now:AudioNode|null)=>void): void

        /** Se désabonner des notifications. Doit être appelé avec le même observer que subscribe. */
        unsubscribe(observer: (old:AudioNode|null, now:AudioNode|null)=>void): void
    }

    /**
     * A input connectable that connect an AudioNode.
     */
    export class Input implements Node3DConnectable {

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly audioNode: AudioNode,
        ){}

        get type(){ return "audio" }

        get color(){ return Color }

        connectAsInput(): AudioN3DConnection {
            const that = this
            return {
                subscribe(observer: (old:AudioNode|null,now:AudioNode|null)=>void) {
                    observer(null,that.audioNode)
                },
                unsubscribe(observer: (old:AudioNode|null,now:AudioNode|null)=>void) {
                    observer(that.audioNode, null)
                }
            }
        }
        disconnectAsInput(_: any): void { }
        
        connectAsOutput(_: any): void { }
        disconnectAsOutput(_: any): void { }
    }

    /**
     * A input connectable that connect an AudioNode, its audio node can be changed at any time.
     * It can also contains no audio node.
     */
    export class DynamicInput implements Node3DConnectable {

        private _audioNode: AudioNode|null = null
        private listeners = new Set<(old:AudioNode|null, now:AudioNode|null)=>void>()

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            audioNode: AudioNode|null,
        ){
            this.audioNode = audioNode
        }

        get type(){ return "audio" }

        get direction(){ return "input" as "input" }

        get color(){ return Color }

        connectAsInput(): AudioN3DConnection {
            const that = this
            return {
                subscribe(observer) {
                    observer(null, that._audioNode)
                    that.listeners.add(observer)
                },
                unsubscribe(observer) {
                    observer(that._audioNode, null)
                    that.listeners.delete(observer)
                },
            }
        }

        disconnectAsInput(_: any): void { }
        connectAsOutput(_: any): void { }
        disconnectAsOutput(_: any): void { }


        set audioNode(audioNode: AudioNode|null){
            const old = this._audioNode
            this._audioNode = audioNode
            for(const listener of this.listeners){
                listener(old, audioNode)
            }
        }
    }

    /**
     * A output connectable that connect an AudioNode.
     */
    export class Output implements Node3DConnectable {

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly audioNode: AudioNode,
        ){}

        get type(){ return "audio" }

        get direction(){ return "output" as "output" }

        get color(){ return Color }

        private callback = (old:AudioNode|null, now:AudioNode|null) => {
            if(old) this.audioNode.disconnect(old)
            if(now) this.audioNode.connect(now)
        }

        connectAsOutput(connection: AudioN3DConnection): void {
            connection.subscribe(this.callback)
        }

        disconnectAsOutput(connection: AudioN3DConnection): void {
            connection.unsubscribe(this.callback)
        }

        connectAsInput() { }
        disconnectAsInput(_: any) { }
    }
    
    /**
     * A output connectable that keep a list of the audio nodes connected to it.
     */
    export class ListOutput implements Node3DConnectable {

        readonly connections: AudioNode[] = []

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            /** A callback called when a new connection is added to the list. */
            readonly on_add: (audioNode:AudioNode) => void,
            /** A callback called when a connection is removed from the list. */
            readonly on_remove: (audioNode:AudioNode) => void,

        ){}

        get type(){ return "audio" }

        get direction(){ return "output" as "output" }

        get color(){ return Color }

        
        private callback = (old:AudioNode|null, now:AudioNode|null) => {
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


        connectAsOutput(connection: AudioN3DConnection): void {
            connection.subscribe(this.callback)
        }

        disconnectAsOutput(connection: AudioN3DConnection): void {
            connection.unsubscribe(this.callback)
        }

        connectAsInput(): any { return {} }
        disconnectAsInput(_: any): void { }

    }

    /**
     * A output connectable that connect an AudioNode, its audio node can be changed at any time.
     * It can also contains no audio node.
     */
    export class DynamicOutput extends ListOutput {

        private _audioNode: AudioNode|null = null

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            audioNode: AudioNode|null,
        ){
            super(
                id, meshes, label,
                (n) => {
                    if(this._audioNode) this._audioNode.connect(n)
                },
                (n) => {
                    if(this._audioNode) this._audioNode.disconnect(n)
                }
            )
            this._audioNode = audioNode
        }

        set audioNode(audioNode: AudioNode|null){
            if(this._audioNode!=null){
                for(const node of this.connections){
                    this.on_remove(node)
                }
            }
            this._audioNode = audioNode
            if(this._audioNode){
                for(const node of this.connections){
                    this.on_add(node)
                }
            }
        }
    }
}