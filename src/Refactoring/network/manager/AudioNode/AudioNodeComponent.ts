import * as Y from 'yjs';
import {NodeTransform, PortParam} from "../../../shared/SharedTypes.ts";
import {PositionComponent} from "./PositionComponent.ts";
import {CreationComponent} from "./CreationComponent.ts";
import {TubeComponent} from "./TubeComponent.ts";
import {AudioNode3D} from "../../../ConnecterWAM/AudioNode3D.ts";
import {ConnectionQueueManager} from "../ConnectionQueueManager.ts";
import { StateComponent } from './StateComponent.ts';
import { SyncManager } from '../../sync/SyncManager.ts';

/**
 * Composant gérant les nœuds audio et leurs états.
 * Responsable de la synchronisation des états des nœuds audio via Y.js.
 */
export class AudioNodeComponent {
    private readonly doc: Y.Doc;
    private audioNodes = new Map<string, AudioNode3D>();

    // Les différents états à partagés
    private networkKinds: Y.Map<string>; // Les types de nœuds audio
    private networkStates: Y.Map<Y.Map<any>>; // Les états personnalisé des AudioNode3D
    private networkPositions: Y.Map<NodeTransform>; // Les positions et rotationss
    private networkConnections: Y.Map<PortParam>; // Les connections

    // Les différents "composants" qui gère la synchronisation des
    // différents états.
    // La séparation en composants rend le code plus clair.
    private positionComponent!: PositionComponent;
    private stateComponent!: StateComponent;
    private creationComponent!: CreationComponent;
    private tubeComponent!: TubeComponent;
    private connectionQueueManager!: ConnectionQueueManager;

    // Options qui permet d'indiquer de ne pas changer dans le document les choses changées en local
    // ou en local les modifications faites dans le document pour éviter les cycles.
    public isProcessingYjsEvent = false;
    public isProcessingLocalEvent = false;


    constructor(doc: Y.Doc) {
        this.doc = doc;

        // Initialisation des maps Y.js
        this.networkKinds = doc.getMap('kinds');
        this.networkStates = doc.getMap('states');
        this.networkPositions = doc.getMap('positions');
        this.networkConnections = doc.getMap('connections');

        this.setupEventListeners();
        console.log(`[AudioNodeComponent] Initialized`);
    }


    public initialize(): void {
        this.creationComponent = new CreationComponent(this);
        this.creationComponent.initialize();

        this.positionComponent = new PositionComponent(this);
        this.positionComponent.initialize()

        this.stateComponent = new StateComponent(this);
        this.stateComponent.initialize();

        this.tubeComponent = new TubeComponent(this);
        this.tubeComponent.initialize();

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

    public getKindMap() { return this.networkKinds }

    public getStateMap() { return this.networkStates }

    public getPositionMap() { return this.networkPositions }

    public getConnectionMap() { return this.networkConnections }
    

    public getNodeById(id: string) { return this.audioNodes.get(id) }


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