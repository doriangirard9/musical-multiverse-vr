import {NodeTransform} from "../../../shared/SharedTypes.ts";
import * as Y from 'yjs';
import {AudioEventBus, AudioEventPayload} from "../../../eventBus/AudioEventBus.ts";
import * as B from "@babylonjs/core";
import {AudioNodeComponent} from "./AudioNodeComponent.ts";

export class PositionComponent {
    private parent : AudioNodeComponent;

    private readonly networkPositions: Y.Map<NodeTransform>;

    private audioEventBus = AudioEventBus.getInstance();

    constructor(parent: AudioNodeComponent) {
        this.parent = parent;
        this.networkPositions = this.parent.getPositionMap();
    }

    public initialize(): void {
        this.setupEventListeners();
        this.setupNetworkObservers();

        console.log(`[PositionComponent] Initialized`);
    }

    private setupEventListeners(): void {
        this.audioEventBus.on('POSITION_CHANGE', (payload : AudioEventPayload['POSITION_CHANGE']) => {
            if(payload.source === 'user'){
                this.handlePositionChange(payload);
            }
        })
    }

    private setupNetworkObservers(): void {
        this.networkPositions.observe((event) => {
           this.handlePositionUpdates(event)
        });
    }

    private handlePositionChange(payload: AudioEventPayload['POSITION_CHANGE']): void {
        const transform: NodeTransform = {
            position: {
                x: payload.position.x,
                y: payload.position.y,
                z: payload.position.z
            },
            rotation: {
                x: payload.rotation.x,
                y: payload.rotation.y,
                z: payload.rotation.z
            }
        };
        this.networkPositions.set(payload.nodeId, transform);
    }
    private handlePositionUpdates(event: Y.YMapEvent<NodeTransform>): void {
        event.changes.keys.forEach((change, key) => {
            if (change.action === "update" || change.action === "add") {
                const update = this.networkPositions.get(key);
                if (update) {
                    const node = this.parent.getAudioNode(key);
                    if (node) {
                        node.updatePosition(
                            new B.Vector3(
                                update.position.x,
                                update.position.y,
                                update.position.z
                            ),
                            new B.Vector3(
                                update.rotation.x,
                                update.rotation.y,
                                update.rotation.z
                            )
                        );
                        this.audioEventBus.emit('POSITION_CHANGE', {
                            nodeId: key,
                            position: {
                                x: update.position.x,
                                y: update.position.y,
                                z: update.position.z
                            },
                            rotation: {
                                x: update.rotation.x,
                                y: update.rotation.y,
                                z: update.rotation.z
                            },
                            source: 'network'
                        });
                    }
                }
            }
        });
    }
}