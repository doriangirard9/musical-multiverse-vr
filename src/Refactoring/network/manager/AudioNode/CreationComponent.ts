import * as Y from 'yjs';
import {AudioNodeComponent} from "./AudioNodeComponent.ts";
import {AudioNodeState} from "../../types.ts";
import {Wam3D} from "../../../ConnecterWAM/Wam3D.ts";
import {NodeTransform} from "../../../shared/SharedTypes.ts";
import {AudioEventBus, AudioEventPayload} from "../../../eventBus/AudioEventBus.ts";
import {MenuEventBus, MenuEventPayload} from "../../../eventBus/MenuEventBus.ts";

export class CreationComponent {
    private readonly networkAudioNodes3D: Y.Map<AudioNodeState>;
    private readonly localAudioNodes3D: Map<String,Wam3D>;

    private readonly networkPositions: Y.Map<NodeTransform>;

    private audioEventBus = AudioEventBus.getInstance();
    private menuEventBus = MenuEventBus.getInstance();

    constructor(parent: AudioNodeComponent) {
        this.networkAudioNodes3D = parent.getNetworkAudioNodes()
        this.localAudioNodes3D = parent.getAudioNodes();
        this.networkPositions = parent.getPositionMap();
    }

    public initialize(): void {
        this.setupEventListeners();
        this.setupNetworkObservers();
        console.log(`[CreationComponent] Initialized`);
    }

    private setupEventListeners(): void {

    }

    private setupNetworkObservers(): void {
        this.networkAudioNodes3D.observe((event) => {
            console.log(`[CreationComponent] AudioNode changes: ${JSON.stringify(event.changes.keys)}`);
            event.changes.keys.forEach((change, key) => {
                this.handleAudioNodeChange(change, key);
            });
        });
    }

    private handleAudioNodeChange(change: any, key: string): void {
        switch (change.action) {
            case "add":
                this.handleAudioNodeAdd(key);
                break;
            case "update":
                this.handleAudioNodeUpdate(key);
                break;
            case "delete":
                this.handleAudioNodeDelete(key);
                break;
        }
    }

    private handleAudioNodeAdd(key: string): void {
        if (!this.localAudioNodes3D.has(key)) {
            console.log(`[CreationComponent] AudioNode added: ${key}`);
            const state = this.networkAudioNodes3D.get(key);
            if (state) {
                console.log(`[CreationComponent] AudioNode state: ${JSON.stringify(state)}`);
                const position = this.networkPositions.get(key);
                if (position) {
                    state.position = position.position;
                    state.rotation = position.rotation;
                }
                this.audioEventBus.emit('REMOTE_AUDIO_NODE_ADDED',{state : state});
            }
        }
    }


    private handleAudioNodeUpdate(key: string): void{
        const state = this.networkAudioNodes3D.get(key);
        if (state) {
            const audioNode = this.localAudioNodes3D.get(key);
            if (audioNode) {
                audioNode.setState({
                    ...state,
                    parameters: state.parameters
                });
            }
        }
    }

    private handleAudioNodeDelete(key: string): void {
        if (this.localAudioNodes3D.has(key)) {
            this.audioEventBus.emit('REMOTE_AUDIO_NODE_DELETED',{nodeId : key});
            this.localAudioNodes3D.delete(key);

        }
    }
}