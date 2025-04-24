import {Mesh, Nullable, Scene} from "@babylonjs/core";
import {MessageManager} from "../../MessageManager.ts";
import {SceneManager} from "../app/SceneManager.ts";
import {XRManager} from "../../xr/XRManager.ts";
import {IOEvent} from "./IOEvent.ts";
import {Wam3D} from "../ConnecterWAM/Wam3D.ts";

export class IOManager {
    private readonly _scene: Scene;
    private _messageManager: MessageManager;

    private _inputNode: Nullable<Wam3D> = null;
    private _outputNode: Nullable<Wam3D> = null;
    private _currentPortId: 'audioIn' | 'audioOut' | 'midiIn' | 'midiOut';

    constructor() {
        this._scene = SceneManager.getInstance().getScene();
        this._messageManager = new MessageManager(this._scene,XRManager.getInstance());

    }

    public onIOEvent(event: IOEvent): void {
        switch (event.pickType) {
            case "down":
                this._currentPortId = event.portId;
                this._handleConnectionStart(event);
                // down = créé le tube
                break;
            case "up":
                this._handleConnectionEnd(event);
                // up = vérifier si on peut connecter puis connecter
                break;
            default:
                this._resetConnectionState();
                break;
        }
    }


    private _handleConnectionStart(event: IOEvent) {
        const node = event.node;
        const type = event.type;

        switch (type) {
            case 'input':
                console.log("input node");
                if (node.inputMesh) {
                    this.createVirtualDragPoint(node.inputMesh);
                    this._inputNode = node;
                }
                break;

            case 'output':
                this._outputNode = node;
                if (node.outputMesh) {
                    this.createVirtualDragPoint(node.outputMesh);
                    this._inputNode = node;
                }
                break;
        }
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

    }


    private createVirtualDragPoint(nodeMesh: Mesh) {
        console.log("todo",nodeMesh)
    }
    private deleteVirtualTube() {
        console.log("todo")
    }
}