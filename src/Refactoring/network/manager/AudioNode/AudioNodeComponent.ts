import * as Y from 'yjs';
import { AudioNodeState } from "../../types.ts";
import {NodeTransform, ParamUpdate, PortParam} from "../../../shared/SharedTypes.ts";
import {PositionComponent} from "./PositionComponent.ts";
import {Wam3D} from "../../../ConnecterWAM/Wam3D.ts";
import {ParameterComponent} from "./ParameterComponent.ts";
import {CreationComponent} from "./CreationComponent.ts";
import {TubeComponent} from "./TubeComponent.ts";

/**
 * Composant gérant les nœuds audio et leurs états.
 * Responsable de la synchronisation des états des nœuds audio via Y.js.
 */
export class AudioNodeComponent {
    private readonly doc: Y.Doc;
    private audioNodes = new Map<string, Wam3D>();

    private readonly networkAudioNodes: Y.Map<AudioNodeState>;
    private readonly networkPositions: Y.Map<NodeTransform>;
    private readonly networkParamUpdates: Y.Map<ParamUpdate>;
    private readonly networkConnections: Y.Map<PortParam>;
    private positionComponent!: PositionComponent;
    private parameterComponent!: ParameterComponent;
    private creationComponent!: CreationComponent;
    private tubeComponent!: TubeComponent;

    public isProcessingYjsEvent = false;
    public isProcessingLocalEvent = false;


    constructor(doc: Y.Doc) {
        this.doc = doc;

        // Initialisation des maps Y.js
        this.networkAudioNodes = doc.getMap('audioNodes');
        this.networkPositions = doc.getMap('positions');
        this.networkParamUpdates = doc.getMap('paramUpdates');
        this.networkConnections = doc.getMap('connections');
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


    }
    private setupEventListeners(): void {}

    public getYjsDoc(): Y.Doc {
        return this.doc;
    }

    public getAudioNode(id: string): Wam3D | undefined {
        return this.audioNodes.get(id);
    }
    public getAudioNodes(): Map<string, Wam3D> {
        return this.audioNodes;
    }
    public addAudioNode(id: string, node: Wam3D): void {
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