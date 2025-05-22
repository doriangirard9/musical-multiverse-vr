import {AudioNodeComponent} from "./AudioNodeComponent.ts";
import {AudioEventBus, AudioEventPayload} from "../../../eventBus/AudioEventBus.ts";
import { AudioManager } from "../../../app/AudioManager.ts";
import * as Y from "yjs";

export class CreationComponent {
    private localAudioNodes3D

    private networkAudioNodeKind
    private networkAudioNodeState
    private networkAudioNodePosition

    private audioEventBus = AudioEventBus.getInstance();

    constructor(private parent: AudioNodeComponent) {
        this.localAudioNodes3D = parent.getAudioNodes()
        
        this.networkAudioNodeKind = parent.getKindMap()
        this.networkAudioNodeState = parent.getStateMap()
        this.networkAudioNodePosition = parent.getPositionMap()
    }

    public initialize(): void {
        this.setupEventListeners();
        this.setupNetworkObservers();
        console.log(`[CreationComponent] Initialized`);
    }

    //// From Local to Network ////
    private setupEventListeners(): void {
        this.audioEventBus.on('AUDIO_NODE_CREATED', this.handleLocalToNetwork.bind(this));
    }

    private handleLocalToNetwork(payload: AudioEventPayload['AUDIO_NODE_CREATED']): void {
        this.parent.withLocalProcessing(() => {
            // Kind
            this.networkAudioNodeKind.set(payload.nodeId, payload.kind)

            // State
            this.networkAudioNodeState.set(payload.nodeId, new Y.Map())

            // Position
            this.networkAudioNodePosition.set(payload.nodeId, {position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}})
        });

        console.log(`[AudioNodeComponent] Local node added to network: ${payload.nodeId}`);
    }


    //// From Network to Local ////
    private setupNetworkObservers(): void {
        this.networkAudioNodeKind.observe((event) => {
            if(this.parent.isProcessingLocalEvent) return
            event.changes.keys.forEach((change, key) => {
                if(change.action === "add"){
                    AudioManager.getInstance().createAudioNode3D(key, this.networkAudioNodeKind.get(key)!!)
                }
                else if(change.action === "delete"){
                    if (this.localAudioNodes3D.has(key)) {
                        this.localAudioNodes3D.delete(key);
                    }
                }
            })
        })
    }

}