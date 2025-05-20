import * as Y from 'yjs';
import {AudioNodeComponent} from "./AudioNodeComponent.ts";
import {AudioNodeState} from "../../types.ts";
import {Wam3D} from "../../../ConnecterWAM/Wam3D.ts";
import {NodeTransform} from "../../../shared/SharedTypes.ts";
import {AudioEventBus} from "../../../eventBus/AudioEventBus.ts";

export class CreationComponent {
    private readonly networkAudioNodes3D: Y.Map<AudioNodeState>;
    private readonly localAudioNodes3D: Map<String,Wam3D>;

    private readonly networkPositions: Y.Map<NodeTransform>;

    private audioEventBus = AudioEventBus.getInstance();
    private readonly parent: AudioNodeComponent;

    constructor(parent: AudioNodeComponent) {
        this.parent = parent;
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
        this.audioEventBus.on('LOCAL_AUDIO_NODE_CREATED', this.handleLocalNodeCreated.bind(this));
    }

    private setupNetworkObservers(): void {
        this.networkAudioNodes3D.observe((event) => {

            if (this.parent.isProcessingLocalEvent) {
                return;
            }

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

                // Récupérer la position depuis networkPositions si disponible
                const position = this.networkPositions.get(key);
                if (position) {
                    state.position = position.position;
                    state.rotation = position.rotation;
                }

                // S'assurer que les paramètres sont inclus dans l'événement
                // C'est crucial pour que les nouveaux clients reçoivent les bons paramètres
                this.audioEventBus.emit('REMOTE_AUDIO_NODE_ADDED', { state: state });

                // Après la création du nœud, vérifier s'il a été correctement ajouté et appliquer les paramètres
                setTimeout(() => {
                    const node = this.localAudioNodes3D.get(key);
                    if (node && state.parameters) {
                        console.log(`[CreationComponent] Applying parameters to newly created node ${key}:`, state.parameters);

                        // Appliquer chaque paramètre individuellement
                        for (const paramId in state.parameters) {
                            const param = state.parameters[paramId];
                            node.updateSingleParameter(paramId, param.value);
                        }
                    }
                }, 100); // Petit délai pour s'assurer que le nœud est bien initialisé
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

    private handleLocalNodeCreated(payload: { state: AudioNodeState }): void {
        // Utiliser withLocalProcessing pour éviter la boucle
        this.parent.withLocalProcessing(() => {
            this.networkAudioNodes3D.set(payload.state.id, payload.state);
            this.networkPositions.set(payload.state.id, {
                position: payload.state.position,
                rotation: payload.state.rotation
            });
        });

        console.log(`[AudioNodeComponent] Local node added to network: ${payload.state.id}`);
    }

}