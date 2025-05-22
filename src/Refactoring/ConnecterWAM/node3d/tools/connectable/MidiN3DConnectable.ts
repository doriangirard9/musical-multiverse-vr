import { AbstractMesh, Color3 } from "@babylonjs/core";
import { Node3DConnectable } from "../../Node3DConnectable";
import { WamNode } from "@webaudiomodules/api";

/**
 * Simple implementations of Node3DConnectable for the "audio" protocol.
 */
export class MidiN3DConnectable{

    private constructor(){}

    /**
     * A input connectable that connect an WamNode.
     */
    static Input = class Input implements Node3DConnectable {

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly wamNode: WamNode,
        ){}

        get type(){ return "midi" }

        get direction(){ return "input" as "input" }

        get color(){ return Color3.Blue() }

        connect(sender: (value: any) => void): void {
            sender({connectMidi:this.wamNode})
        }

        disconnect(sender: (value: any) => void): void {
            sender({disconnectMidi:this.wamNode})
        }

        receive(_: any): void { }
    }

    /**
     * A input connectable that connect an WamNode, its audio node can be changed at any time.
     * It can also contains no audio node.
     */
    static DynamicInput = class Input implements Node3DConnectable {

        private _audioNode: WamNode|null = null
        private senders: ((value: any) => void)[] = []

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

        get color(){ return Color3.Blue() }

        connect(sender: (value: any) => void): void {
            this.senders.push(sender)
            if(this._audioNode) sender({connectMidi:this._audioNode})
        }

        disconnect(sender: (value: any) => void): void {
            const index = this.senders.indexOf(sender)
            if(index !== -1) this.senders.splice(index, 1)
            if(this._audioNode) sender({disconnectMidi:this._audioNode})
        }

        set wamNode(wamNode: WamNode|null){
            if(this._audioNode!=null){
                for(const sender of this.senders){
                    sender({disconnectMidi:this._audioNode})
                }
            }
            this._audioNode = wamNode
            if(this._audioNode){
                for(const sender of this.senders){
                    sender({connectMidi:this._audioNode})
                }
            }
        }

        receive(_: any): void { }
    }

    /**
     * A output connectable that connect an WamNode.
     */
    static Output = class Output implements Node3DConnectable {

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly wamNode: WamNode,
        ){}

        get type(){ return "midi" }

        get direction(){ return "output" as "output" }

        get color(){ return Color3.Blue() }

        connect(_: (value: any) => void): void { }

        disconnect(_: (value: any) => void): void { }

        receive(value: any): void {
            if(typeof value === "object"){
                if("connectMidi" in value) this.wamNode.connectEvents((value.connectMidi as WamNode).instanceId)
                else if("disconnectMidi" in value) this.wamNode.disconnectEvents((value.disconnectMidi as WamNode).instanceId)
            }
        }
    }
    
    /**
     * A output connectable that keep a list of the audio nodes connected to it.
     */
    static ListOutput = class ListOutput implements Node3DConnectable {

        readonly connections: WamNode[] = []

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            /** A callback called when a new connection is added to the list. */
            readonly on_add: (wamNode:WamNode) => void,
            /** A callback called when a connection is removed from the list. */
            readonly on_remove: (wamNode:WamNode) => void,

        ){}

        get type(){ return "midi" }

        get direction(){ return "output" as "output" }

        get color(){ return Color3.Blue() }

        connect(_: (value: any) => void): void { }

        disconnect(_: (value: any) => void): void { }

        receive(value: any): void {
            if(typeof value === "object"){
                if("connectMidi" in value){
                    this.connections.push(value.connectMidi as WamNode)
                    this.on_add(value.connectMidi as WamNode)
                }
                else if("disconnectMidi" in value){
                    const index = this.connections.indexOf(value.disconnectMidi as WamNode)
                    if(index !== -1){
                        this.connections.splice(index, 1)
                        this.on_remove(value.disconnectMidi as WamNode)
                    }
                }
            }
        }
    }

    /**
     * A output connectable that connect an WamNode, its audio node can be changed at any time.
     * It can also contains no audio node.
     */
    static DynamicOutput = class DynamicOutput extends MidiN3DConnectable.ListOutput {

        private _audioNode: WamNode|null = null

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            wamNode: WamNode|null,
        ){
            super(
                id, meshes, label,
                () => {
                    if(this._audioNode) this.connections.forEach(n=>this._audioNode?.connectEvents((n as WamNode).instanceId))
                },
                () => {
                    if(this._audioNode) this.connections.forEach(n=>this._audioNode?.disconnectEvents((n as WamNode).instanceId))
                }
            )
            this._audioNode = wamNode
        }

        set wamNode(wamNode: WamNode|null){
            if(this._audioNode!=null){
                for(const wamNode of this.connections){
                    this.on_remove(wamNode)
                }
            }
            this._audioNode = wamNode
            if(this._audioNode){
                for(const wamNode of this.connections){
                    this.on_add(wamNode)
                }
            }
        }
    }
}