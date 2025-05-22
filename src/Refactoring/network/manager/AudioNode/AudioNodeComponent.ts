import * as Y from 'yjs';
import {AudioNodeState, AudioOutputState} from "../../types.ts";
import {NodeTransform, ParamUpdate, PortParam} from "../../../shared/SharedTypes.ts";
import {PositionComponent} from "./PositionComponent.ts";
import {ParameterComponent} from "./ParameterComponent.ts";
import {CreationComponent} from "./CreationComponent.ts";
import {TubeComponent} from "./TubeComponent.ts";
import {AudioOutputComponent} from "./AudioOutputComponent.ts";
import {AudioOutput3D} from "../../../app/AudioOutput3D.ts";
import {AudioNode3D} from "../../../ConnecterWAM/AudioNode3D.ts";
import {ConnectionQueueManager} from "../ConnectionQueueManager.ts";

/**
 * Composant gérant les nœuds audio et leurs états.
 * Responsable de la synchronisation des états des nœuds audio via Y.js.
 */
export class AudioNodeComponent {
    private readonly doc: Y.Doc;
    private audioNodes = new Map<string, AudioNode3D>();

    private readonly networkAudioNodes: Y.Map<AudioNodeState>;
    private readonly networkPositions: Y.Map<NodeTransform>;
    private readonly networkParamUpdates: Y.Map<ParamUpdate>;
    private readonly networkConnections: Y.Map<PortParam>;
    private readonly networkAudioOutputs: Y.Map<AudioOutputState>;

    private positionComponent!: PositionComponent;
    private parameterComponent!: ParameterComponent;
    private creationComponent!: CreationComponent;
    private tubeComponent!: TubeComponent;
    private audioOutputComponent!: AudioOutputComponent;
    private connectionQueueManager!: ConnectionQueueManager;

    public isProcessingYjsEvent = false;
    public isProcessingLocalEvent = false;


    constructor(doc: Y.Doc) {
        this.doc = doc;

        // Initialisation des maps Y.js
        this.networkAudioNodes = doc.getMap('audioNodes');
        this.networkPositions = doc.getMap('positions');
        this.networkParamUpdates = doc.getMap('paramUpdates');
        this.networkConnections = doc.getMap('connections');
        this.networkAudioOutputs = doc.getMap('audioOutputs');

        this.setupEventListeners();
        console.log(`[AudioNodeComponent] Initialized`);
    }
    public initialize(): void {
        // Initialisation des composants
        this.creationComponent = new CreationComponent(this);
        this.creationComponent.initialize();

        this.positionComponent = new PositionComponent(this);
        this.positionComponent.initialize()

        this.parameterComponent = new ParameterComponent(this);
        this.parameterComponent.initialize();

        this.tubeComponent = new TubeComponent(this);
        this.tubeComponent.initialize();

        this.audioOutputComponent = new AudioOutputComponent(this);
        this.audioOutputComponent.initialize();

        this.connectionQueueManager = new ConnectionQueueManager(this);
        this.connectionQueueManager.initialize();

    }
    private setupEventListeners(): void {}

    public getYjsDoc(): Y.Doc {
        return this.doc;
    }

    public getAudioNode(id: string): AudioNode3D | undefined {
        return this.audioNodes.get(id);
    }
    public getAudioNodes(): Map<string, AudioNode3D> {
        return this.audioNodes;
    }
    public addAudioNode(id: string, node: AudioNode3D): void {
        this.audioNodes.set(id, node);
    }
    public getNetworkAudioNodes(): Y.Map<AudioNodeState> {
        return this.networkAudioNodes
    }
    public getPositionMap(): Y.Map<NodeTransform> {
        return this.networkPositions;
    }
    public getNetworkConnections(): Y.Map<PortParam> {
        return this.networkConnections;
    }
    public getNetworkParamUpdatesMap(): Y.Map<ParamUpdate> {
        return this.networkParamUpdates;
    }
    public getAudioOutputsMap(): Y.Map<AudioOutputState> {
        return this.networkAudioOutputs;
    }
    public getAudioOutput(id: string): AudioOutput3D | undefined {
        return this.audioOutputComponent.getAudioOutput(id);
    }
    public getNodeById(id: string): AudioNode3D | undefined {
        // D'abord chercher dans les Wam3D
        const wamNode = this.audioNodes.get(id);
        if (wamNode) return wamNode;

        // Puis chercher dans les AudioOutput3D
        return this.audioOutputComponent.getAudioOutput(id);
    }

    public getAudioOutputComponent(){
        return this.audioOutputComponent;
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