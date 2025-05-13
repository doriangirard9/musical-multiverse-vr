import * as Y from 'yjs';
import * as B from "@babylonjs/core";
import { AudioNodeState } from "../../types.ts";
import { AudioNode3D } from "../../../ConnecterWAM/AudioNode3D.ts";
import { AudioEventBus } from "../../../eventBus/AudioEventBus.ts";
import { NodeTransform } from "../../../shared/SharedTypes.ts";
import {PositionComponent} from "./PositionComponent.ts";
import {Wam3D} from "../../../ConnecterWAM/Wam3D.ts";
import {ParameterComponent} from "./ParameterComponent.ts";
import {CreationComponent} from "./CreationComponent.ts";

/**
 * Composant gérant les nœuds audio et leurs états.
 * Responsable de la synchronisation des états des nœuds audio via Y.js.
 */
export class AudioNodeComponent {
    private readonly doc: Y.Doc;
    private readonly localId: string;
    private readonly audioEventBus = AudioEventBus.getInstance();

    private audioNodes = new Map<string, Wam3D>();

    private readonly networkAudioNodes: Y.Map<AudioNodeState>;
    private readonly networkPositions: Y.Map<NodeTransform>;

    private positionComponent!: PositionComponent;
    private parameterComponent!: ParameterComponent;
    private creationComponent!: CreationComponent;

    private isProcessingYjsEvent = false;
    private isProcessingLocalEvent = false;


    constructor(doc: Y.Doc, localId: string) {
        this.doc = doc;
        this.localId = localId;

        // Initialisation des maps Y.js
        this.networkAudioNodes = doc.getMap('audioNodes');
        this.networkPositions = doc.getMap('positions');

        this.setupEventListeners();
        console.log(`[AudioNodeComponent] Initialized`);
    }
    public initialize(): void {
        // Initialisation des composants
        this.creationComponent = new CreationComponent(this);
        this.creationComponent.initialize();

        this.positionComponent = new PositionComponent(this);
        this.positionComponent.initialize()
    }
    private setupEventListeners(): void {}

    public getYjsDoc(): Y.Doc {
        return this.doc;
    }

    public getAudioNode(id: string): AudioNode3D | undefined {
        return this.audioNodes.get(id);
    }
    public getAudioNodes(): Map<string, Wam3D> {
        return this.audioNodes;
    }
    public getNetworkAudioNodes(): Y.Map<AudioNodeState> {
        return this.networkAudioNodes
    }
    public getPositionMap(): Y.Map<NodeTransform> {
        return this.networkPositions;
    }
    public withLocalProcessing<T>(action: () => T): T {
        this.isProcessingLocalEvent = true;
        try {
            return action();
        } finally {
            this.isProcessingLocalEvent = false;
        }
    }

    public withNetworkProcessing<T>(action: () => T): T {
        this.isProcessingYjsEvent = true;
        try {
            return action();
        } finally {
            this.isProcessingYjsEvent = false;
        }
    }
}