import * as Y from 'yjs';
import {AudioEventBus, AudioEventPayload} from "../../../eventBus/AudioEventBus.ts";
import {AudioNodeComponent} from "./AudioNodeComponent.ts";

export class StateComponent {

    private networkStates
    private audioEventBus = AudioEventBus.getInstance()

    private readonly UPDATE_INTERVAL = 50; // 20 fois par seconde

    constructor(private parent: AudioNodeComponent) {
        this.parent = parent;
        this.networkStates = this.parent.getStateMap();
    }

    public initialize(): void {
        this.setupLocalToNetwork();
        this.setupNetworkToLocal();
        setInterval(() => this.processPendingUpdates(), this.UPDATE_INTERVAL)
    }


    //// LOCAL TO NETWORK ////
    private pendingUpdates = new Map<string, Map<string,any>>();

    private setupLocalToNetwork(): void {
        this.audioEventBus.on('STATE_CHANGE', (payload) => this.handleStateChange(payload))
    }

    private async handleStateChange(payload: AudioEventPayload['STATE_CHANGE']) {
        const node = this.parent.getNodeById(payload.nodeId)!!

        const state_map = this.pendingUpdates.get(payload.nodeId) ?? new Map<string,any>()
        this.pendingUpdates.set(payload.nodeId, state_map)

        const value = await node.getState(payload.key)
        
        state_map.set(payload.key, value)
    }

    private processPendingUpdates(): void {
        for(const [nodeId, state_map] of this.pendingUpdates.entries()) {
            for(const [key, value] of state_map.entries()) {
                this.networkStates.get(nodeId)!!.set(key, value)
            }
        }
        this.pendingUpdates.clear()
    }


    //// NETWORK TO LOCAL ////
    private setupNetworkToLocal(): void {
        const {parent} = this
        function onStateChange(nodeId: string, state_map: Y.Map<any>){
            const node = parent.getNodeById(nodeId)!!
            state_map.observe((event)=>{
                for(const [key,{action}] of event.changes.keys){
                    if(action=="add"||action=="update") node.setState(key, state_map.get(key))
                }
            })
        }
        this.networkStates.observe((event) => {
            for(const [key, {action}] of event.changes.keys) {
                if(action=="add"||action=="update") {
                    const state_map = event.target.get(key)
                    if(state_map) onStateChange(key, state_map)
                }
                else if(action=="delete") {
                    this.cleanupNode(key)
                }
            }
        })
        for(const [key, state_map] of this.networkStates.entries()) {
            if(state_map) onStateChange(key, state_map)
        }
    }

    public cleanupNode(nodeId: string): void {
        this.pendingUpdates.delete(nodeId);
    }
}