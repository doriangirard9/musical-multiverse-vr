import {Nullable} from "@babylonjs/core";
import {IOEvent} from "./IOEvent.ts";
import {Wam3D} from "../ConnecterWAM/Wam3D.ts";
import {MessageManager} from "../app/MessageManager.ts";
import {IOEventBus, IOEventPayload} from "../eventBus/IOEventBus.ts";

export class IOManager {
    private _messageManager: MessageManager;

    private _inputNode: Nullable<Wam3D> = null;
    private _outputNode: Nullable<Wam3D> = null;
    private _currentPortId: 'audioIn' | 'audioOut' | 'midiIn' | 'midiOut' | null = null;
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

    public onIOEvent(): void {
        this.ioEventBus.on('IO_CONNECT',payload => {
            this.handler(payload)
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


    private _handleConnectionStart() {
        console.log("Tried to connect : " + this._inputNode?.id + " to " + this._outputNode?.id + " Using port : " + this._currentPortId);
    }

    private _handleConnectionEnd(event: IOEvent) {
        if (this._outputNode) {
            if (this._outputNode.id === event.node.id) {
                this._messageManager.showMessage("Can't connect a node to itself", 2000);
                this._resetConnectionState();
            }
            else {

                const sourcePortId = this._currentPortId;
                const targetPortId = event.portId;

                this._outputNode.connectPorts(sourcePortId, event.node, targetPortId);
            }
        }
    }

    private _resetConnectionState() {
        this._inputNode = null;
        this._outputNode = null;
        this._currentPortId = null;
    }

}