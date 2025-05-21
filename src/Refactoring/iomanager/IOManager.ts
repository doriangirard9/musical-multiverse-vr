import {Nullable} from "@babylonjs/core";
import {Wam3D} from "../ConnecterWAM/Wam3D.ts";
import {MessageManager} from "../app/MessageManager.ts";
import {IOEventBus, IOEventPayload} from "../eventBus/IOEventBus.ts";
import {AudioOutput3D} from "../app/AudioOutput3D.ts";

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

    private _resetConnectionState() {
        this._inputNode = null;
        this._outputNode = null;
        this._currentPortId = null;
        this._currentAudioOutput = null;
    }

}