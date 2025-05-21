import {Color3, Nullable} from "@babylonjs/core";
import {Wam3D} from "../ConnecterWAM/Wam3D.ts";
import {MessageManager} from "../app/MessageManager.ts";
import {IOEventBus, IOEventPayload} from "../eventBus/IOEventBus.ts";
import {AudioOutput3D} from "../app/AudioOutput3D.ts";
import { Node3DInstance } from "../ConnecterWAM/node3d/instance/Node3DInstance.ts";
import { Node3DConnectable } from "../ConnecterWAM/node3d/Node3DConnectable.ts";
import { WamNode } from "@webaudiomodules/api";

export class IOManager {
    private _messageManager: MessageManager;

    private _inputNode: Nullable<Wam3D> = null;
    private _outputNode: Nullable<Wam3D> = null;
    private _currentPortId: 'audioIn' | 'audioOut' | 'midiIn' | 'midiOut' | null = null;
    //@ts-ignore var jamais read
    private _currentAudioOutput: Nullable<AudioOutput3D> = null;

    private static instance: IOManager;

    private ioEventBus: IOEventBus = IOEventBus.getInstance();

    private constructor() {
        this._messageManager = new MessageManager();


        this.onIOEvent()
    }

    public static getInstance(): IOManager {
        if (!IOManager.instance) {
            IOManager.instance = new IOManager();
        }
        return IOManager.instance;
    }

    private onIOEvent(): void {
        this.ioEventBus.on('IO_CONNECT',payload => {
            this.handler(payload)
        });
        this.ioEventBus.on('IO_CONNECT_AUDIO_OUTPUT', payload => {
           this.audioOutputHandler(payload)
        });
        this.ioEventBus.on('IO_CONNECT_NODE3D', payload => {
            this.node3dHandler(payload)
        });
    }

    private handler(data: IOEventPayload['IO_CONNECT']) {
        console.log("IOManager: ", data);

        switch (data.pickType) {
            case "down":
                this._currentPortId = data.portId;

                if (data.isInput) {
                    this._inputNode = data.node;

                } else {
                    this._outputNode = data.node;

                }
                break;

            case "up":
                if (data.isInput) {
                    if (this._outputNode) {
                        if (data.node.id === this._outputNode.id) {
                            this._messageManager.showMessage("Can't connect a node to itself", 3000);
                        } else {
                            this._outputNode.connectPorts(this._currentPortId!, data.node, data.portId);
                        }
                        this._resetConnectionState();
                    }
                } else {
                    if (this._inputNode) {
                        if (data.node.id === this._inputNode.id) {
                            this._messageManager.showMessage("Can't connect a node to itself", 3000);
                        } else {
                            this._outputNode?.connectPorts(this._currentPortId!, data.node, data.portId);
                        }
                        this._resetConnectionState();
                    }
                }
                break;

            case "out":
                this._resetConnectionState();
                break;
        }
    }
    private audioOutputHandler(data: IOEventPayload['IO_CONNECT_AUDIO_OUTPUT']) {
        const audioOutput = data.audioOutput;

        switch (data.pickType) {
            case "down":
                this._currentAudioOutput = audioOutput;
                break;

            case "up":
                if (this._outputNode) {
                    if (this._outputNode.id !== audioOutput.id) {
                        const sourceNode = this._outputNode.getAudioNode();
                        sourceNode.connect(audioOutput.getAudioNode());
                        console.log("Tried to connect ", this._outputNode.id, " to ", audioOutput.id);
                    } else {
                        this._messageManager.showMessage("Can't connect a node to itself", 2000);
                    }
                    this._resetConnectionState();
                }
                break;

            case "out":
                this._resetConnectionState();
                break;
        }
    }

    private _currentNode3dConnectable = null as null|{instance:Node3DInstance, connectable:Node3DConnectable}

    private node3dHandler(data: IOEventPayload['IO_CONNECT_NODE3D']) {
        const {connectable, instance, pickType} = data

        switch (data.pickType) {
            case "down":
                this._currentNode3dConnectable = {connectable, instance}
                break;

            case "up":
                let otherConnectable: Pick<Node3DConnectable,'connect'|'disconnect'|'receive'|'direction'|'type'>|undefined
                let otherId: string|undefined

                
                const wam3DOutput = this._outputNode
                const wam3DInput= this._inputNode
                const wam3DPortId= this._currentPortId

                // Gérer les connections avec les Wam3D, permet de faire des test mais
                // c'est destiné à disparaitre.
                if (wam3DOutput){
                    otherId = wam3DOutput.id
                    if(wam3DPortId?.startsWith("midi")){
                        otherConnectable = {
                            connect(sender) { },
                            disconnect(sender) { },
                            direction: 'output',
                            type: "midi",
                            receive(value) {
                                if(typeof value == "object"){
                                    if("connectAudio" in value){
                                        wam3DOutput.getAudioNode().connect(value as AudioNode)
                                    }
                                    else if("disconnectAudio" in value){
                                        wam3DOutput.getAudioNode().disconnect(value as AudioNode)
                                    }
                                }
                            },
                        }
                    }
                    else{
                        otherConnectable = {
                            connect(sender) { },
                            disconnect(sender) { },
                            direction: 'output',
                            type: "audio",
                            receive(value) {
                                if(typeof value == "object"){
                                    if("connectMidi" in value){
                                        ;(wam3DOutput.getAudioNode() as WamNode).connectEvents((value as WamNode).instanceId)
                                    }
                                    else if("disconnectMidi" in value){
                                        ;(wam3DOutput.getAudioNode() as WamNode).disconnectEvents((value as WamNode).instanceId)
                                    }
                                }
                            },
                        }
                    }
                    
                }
                else if (wam3DInput){
                    otherId = wam3DInput.id
                    if(wam3DPortId?.startsWith("midi")){
                        otherConnectable = {
                            connect(sender) { sender({connectAudio:wam3DInput.getAudioNode()}) },
                            disconnect(sender) { sender({disconnectAudio:wam3DInput.getAudioNode()}) },
                            direction: 'input',
                            type: "midi",
                            receive(_) { },
                        }
                    }
                    else{
                        otherConnectable = {
                            connect(sender) { sender({connectMidi:wam3DInput.getAudioNode()}) },
                            disconnect(sender) { sender({disconnectMidi:wam3DInput.getAudioNode()}) },
                            direction: 'input',
                            type: "audio",
                            receive(_) {},
                        }
                    }
                }
                else if(this._currentNode3dConnectable){
                    otherId = this._currentNode3dConnectable.instance.id
                    otherConnectable = this._currentNode3dConnectable.connectable
                }

                if(otherId && otherConnectable){
                    if(
                        (
                            otherConnectable.direction == "bidirectional"
                            || connectable.direction == "bidirectional"
                            || connectable.direction != otherConnectable.direction
                        )
                        && otherConnectable.type==connectable.type
                    ){
                        if(otherId != instance.id){
                            let [input,output] = (()=>{
                                if(otherConnectable.direction == "input") return [otherConnectable, connectable]
                                else if(connectable.direction == "input") return [connectable, otherConnectable]

                                else if(otherConnectable.direction == "output") return [connectable, otherConnectable]
                                else if(connectable.direction == "output") return [otherConnectable, connectable]

                                else return [otherConnectable, connectable]

                            })()

                            output.connect(input.receive.bind(input))
                            input.connect(output.receive.bind(output))
                        }
                        else{
                            this._messageManager.showMessage("Can't connect a node to itself", 2000);
                        }
                    }
                    
                }

                if (this._outputNode && ["input","bidirectional"].includes(connectable.direction)) {
                    if (this._outputNode.id !== instance.id) {
                        const sourceNode = this._outputNode.getAudioNode();
                        sourceNode.connect(audioOutput.getAudioNode());
                        console.log("Tried to connect ", this._outputNode.id, " to ", audioOutput.id);
                    } else {
                        this._messageManager.showMessage("Can't connect a node to itself", 2000);
                    }
                    this._resetConnectionState();
                }
                else if(this._inputNode && ["output","bidirectional"].includes(connectable.direction)){

                }
                
                else if(this._currentNode3dConnectable){

                }
                break;

            case "out":
                this._resetConnectionState();
                break;
        }
    }

    private _resetConnectionState() {
        this._inputNode = null;
        this._outputNode = null;
        this._currentPortId = null;
        this._currentAudioOutput = null;
        this._currentNode3dConnectable = null;
    }

}