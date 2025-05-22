import {NodeTransform} from "../../../shared/SharedTypes.ts";
import * as Y from 'yjs';
import {AudioEventBus, AudioEventPayload} from "../../../eventBus/AudioEventBus.ts";
import * as B from "@babylonjs/core";
import {AudioNodeComponent} from "./AudioNodeComponent.ts";

/**
 * Composant qui partage partage sur le réseau la position d'un composant quand elle change
 * en local et change la position d'un composant quand elle change sur le réseau.
 */
export class PositionComponent {
    private parent: AudioNodeComponent;
    private readonly networkPositions: Y.Map<NodeTransform>;
    private audioEventBus = AudioEventBus.getInstance();

    // Paramètres de throttling
    private readonly UPDATE_INTERVAL = 50; // 20 fois par seconde
    private readonly POSITION_THRESHOLD = 0.05; // 1cm
    private readonly ROTATION_THRESHOLD = 0.03; // ~1 degré

    // Maps pour gérer le throttling par nœud
    private lastUpdateTimes = new Map<string, number>();
    private lastSentStates = new Map<string, NodeTransform>();
    private pendingUpdates = new Map<string, NodeTransform>();

    constructor(parent: AudioNodeComponent) {
        this.parent = parent;
        this.networkPositions = this.parent.getPositionMap();
    }

    public initialize(): void {
        this.setupEventListeners();
        this.setupNetworkObservers();

        // Démarrer la boucle de traitement
        setInterval(() => {
            this.processPendingUpdates();
        }, this.UPDATE_INTERVAL);

        console.log(`[PositionComponent] Initialized with throttling`);
    }



    //// From Local to Network  ////
    private setupEventListeners(): void {
        this.audioEventBus.on('POSITION_CHANGE', (payload: AudioEventPayload['POSITION_CHANGE']) => {
            if (payload.source === 'user') {
                this.handlePositionChange(payload);
            }
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

        this.pendingUpdates.set(payload.nodeId, transform);
    }

    private processPendingUpdates(): void {
        const currentTime = performance.now();

        this.pendingUpdates.forEach((pendingTransform, nodeId) => {
            const lastUpdateTime = this.lastUpdateTimes.get(nodeId) || 0;

            if (currentTime - lastUpdateTime > this.UPDATE_INTERVAL) {
                const lastState = this.lastSentStates.get(nodeId);

                if (!lastState || this.hasSignificantChange(pendingTransform, lastState)) {
                    this.parent.withLocalProcessing(() => {
                        this.networkPositions.set(nodeId, pendingTransform);
                    });

                    this.lastSentStates.set(nodeId, {...pendingTransform});
                    this.lastUpdateTimes.set(nodeId, currentTime);
                    console.log(`[PositionComponent] Sent throttled update for node ${nodeId}`);
                }

                this.pendingUpdates.delete(nodeId);
            }
        });
    }

    private hasSignificantChange(current: NodeTransform, previous: NodeTransform): boolean {
        return this.getDistance(current.position, previous.position) > this.POSITION_THRESHOLD ||
            this.getDistance(current.rotation, previous.rotation) > this.ROTATION_THRESHOLD;
    }

    private getDistance(pos1: {x: number, y: number, z: number}, pos2: {x: number, y: number, z: number}): number {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
    }



    //// From Network to Local ////
    private setupNetworkObservers(): void {
        this.networkPositions.observe((event) => this.handlePositionUpdates(event))
    }

    private handlePositionUpdates(event: Y.YMapEvent<NodeTransform>): void {
        event.changes.keys.forEach((change, key) => {
            if (change.action === "update" || change.action === "add") {
                const newValue = event.target.get(key);

                if (newValue) {
                    // Utiliser la nouvelle méthode getNodeById
                    const node = this.parent.getNodeById(key);

                    if (node) {
                        node.setPosition(
                            new B.Vector3( newValue.position.x, newValue.position.y, newValue.position.z),
                            new B.Vector3( newValue.rotation.x, newValue.rotation.y, newValue.rotation.z),
                        );

                        this.audioEventBus.emit('POSITION_CHANGE', {
                            nodeId: key,
                            position: newValue.position,
                            rotation: newValue.rotation,
                            source: 'network'
                        });
                    } else {
                        console.warn(`[PositionComponent] Node ${key} not found locally`);
                    }
                }
            }
            else if(change.action==="delete"){
                this.cleanupNode(key)
            }
        });
    }

    public cleanupNode(nodeId: string): void {
        this.lastUpdateTimes.delete(nodeId);
        this.lastSentStates.delete(nodeId);
        this.pendingUpdates.delete(nodeId);
    }
}