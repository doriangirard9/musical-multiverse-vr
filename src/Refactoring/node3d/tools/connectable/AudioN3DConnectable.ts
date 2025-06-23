import { AbstractMesh, Color3 } from "@babylonjs/core";
import { Node3DConnectable } from "../../Node3DConnectable";

/**
 * Simple implementations of Node3DConnectable for the "audio" protocol.
 */
export class AudioN3DConnectable{

    private constructor(){}

    static InputColor = Color3.FromHexString("#00FF00")

    static OutputColor = Color3.FromHexString("#FF0000")

    /**
     * A input connectable that connect an AudioNode.
     */
    static Input = class Input implements Node3DConnectable {

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly audioNode: AudioNode,
        ){}

        get type(){ return "audio" }

        get direction(){ return "input" as "input" }

        get color(){ return AudioN3DConnectable.OutputColor }

        connect(sender: (value: any) => void): void {
            sender({connectAudio:this.audioNode})
        }

        disconnect(sender: (value: any) => void): void {
            sender({disconnectAudio:this.audioNode})
        }

        receive(_: any): void { }
    }

    /**
     * A input connectable that connect an AudioNode, its audio node can be changed at any time.
     * It can also contains no audio node.
     */
    static DynamicInput = class Input implements Node3DConnectable {

        private _audioNode: AudioNode|null = null
        private senders: ((value: any) => void)[] = []

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

        get color(){ return AudioN3DConnectable.OutputColor }

        connect(sender: (value: any) => void): void {
            this.senders.push(sender)
            if(this._audioNode) sender({connectAudio:this._audioNode})
        }

        disconnect(sender: (value: any) => void): void {
            const index = this.senders.indexOf(sender)
            if(index !== -1) this.senders.splice(index, 1)
            if(this._audioNode) sender({disconnectAudio:this._audioNode})
        }

        set audioNode(audioNode: AudioNode|null){
            if(this._audioNode!=null){
                for(const sender of this.senders){
                    sender({disconnectAudio:this._audioNode})
                }
            }
            this._audioNode = audioNode
            if(this._audioNode){
                for(const sender of this.senders){
                    sender({connectAudio:this._audioNode})
                }
            }
        }

        receive(_: any): void { }
    }

    /**
     * A output connectable that connect an AudioNode.
     */
    static Output = class Output implements Node3DConnectable {

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly audioNode: AudioNode,
        ){}

        get type(){ return "audio" }

        get direction(){ return "output" as "output" }

        get color(){ return AudioN3DConnectable.OutputColor }

        connect(_: (value: any) => void): void { }

        disconnect(_: (value: any) => void): void { }

        receive(value: any): void {
            if(typeof value === "object"){
                if("connectAudio" in value) this.audioNode.connect(value.connectAudio as AudioNode)
                else if("disconnectAudio" in value) this.audioNode.disconnect(value.disconnectAudio as AudioNode)
            }
        }
    }
    
    /**
     * A output connectable that keep a list of the audio nodes connected to it.
     */
    static ListOutput = class ListOutput implements Node3DConnectable {

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

        get color(){ return AudioN3DConnectable.OutputColor }

        connect(_: (value: any) => void): void { }

        disconnect(_: (value: any) => void): void { }

        receive(value: any): void {
            if(typeof value === "object"){
                if("connectAudio" in value){
                    this.connections.push(value.connectAudio as AudioNode)
                    this.on_add(value.connectAudio as AudioNode)
                }
                else if("disconnectAudio" in value){
                    const index = this.connections.indexOf(value.disconnectAudio as AudioNode)
                    if(index !== -1){
                        this.connections.splice(index, 1)
                        this.on_remove(value.disconnectAudio as AudioNode)
                    }
                }
            }
        }
    }

    /**
     * A output connectable that connect an AudioNode, its audio node can be changed at any time.
     * It can also contains no audio node.
     */
    static DynamicOutput = class DynamicOutput extends AudioN3DConnectable.ListOutput {

        private _audioNode: AudioNode|null = null

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            audioNode: AudioNode|null,
        ){
            super(
                id, meshes, label,
                () => {
                    if(this._audioNode) this.connections.forEach(n=>this._audioNode?.connect(n))
                },
                () => {
                    if(this._audioNode) this.connections.forEach(n=>this._audioNode?.disconnect(n))
                }
            )
            this._audioNode = audioNode
        }

        set audioNode(audioNode: AudioNode|null){
            if(this._audioNode!=null){
                for(const audioNode of this.connections){
                    this.on_remove(audioNode)
                }
            }
            this._audioNode = audioNode
            if(this._audioNode){
                for(const audioNode of this.connections){
                    this.on_add(audioNode)
                }
            }
        }
    }
}