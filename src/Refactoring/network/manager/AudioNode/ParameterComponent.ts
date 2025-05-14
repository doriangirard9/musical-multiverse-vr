import {AudioNodeComponent} from "./AudioNodeComponent.ts";
import {AudioEventBus, AudioEventPayload} from "../../../eventBus/AudioEventBus.ts";
import {ParamUpdate} from "../../../shared/SharedTypes.ts";
import * as Y from 'yjs';

export class ParameterComponent {
    private readonly parent: AudioNodeComponent;

    private audioEventBus: AudioEventBus = AudioEventBus.getInstance();

    private readonly networkParamUpdates!: Y.Map<ParamUpdate>;

    constructor(parent: AudioNodeComponent) {
        this.parent = parent;
        this.networkParamUpdates = this.parent.getNetworkParamUpdatesMap()
    }

    public initialize(): void {
        this.setupEventListeners();
        this.setupNetworkObservers();

        console.log(`[ParameterComponent] Initialized`);
    }

    private setupEventListeners(): void {
        this.audioEventBus.on('PARAM_CHANGE', (payload: AudioEventPayload['PARAM_CHANGE']) => {
            if (payload.source === "user" && !this.parent.isProcessingYjsEvent) {
                this.parent.withLocalProcessing(() => this.handleParamChange(payload));
            }
        })
    }

    private setupNetworkObservers(): void {
        this.networkParamUpdates.observe((event) => {
            if (!this.parent.isProcessingLocalEvent) {
                this.parent.withNetworkProcessing(() => this.handleParameterUpdates(event));
            }
        });
    }


    private handleParamChange(payload: AudioEventPayload['PARAM_CHANGE']): void {
        const {nodeId, paramId, value} = payload;
        const update: ParamUpdate = {nodeId, paramId, value: value};
        const key = `${nodeId}-${paramId}-${Date.now()}`;
        console.log("Sending param update:", update);
        this.networkParamUpdates.set(key, update);
    }

    private handleParameterUpdates(event: Y.YMapEvent<ParamUpdate>): void {
        event.changes.keys.forEach((change, key) => {
            if (change.action === "add") {
                const update = this.networkParamUpdates.get(key);
                if (update) {
                    const node = this.parent.getAudioNode(update.nodeId);
                    if (node) {
                        node.updateSingleParameter(update.paramId, update.value);
                    }
                    this.networkParamUpdates.delete(key);
                }
            }
        });
    }
}