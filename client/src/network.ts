import * as Y from 'yjs';
import * as B from '@babylonjs/core';
import { WebrtcProvider } from 'y-webrtc';
import { NetworkPlayer, NetworkStepSequencer } from "./models";
import App from "./app";

export default class Network {
    private doc: Y.Doc;
    private provider: WebrtcProvider;

    players: Y.Map<NetworkPlayer>;
    stepSequencers: Y.Map<NetworkStepSequencer>;

    constructor(private app: App) {
        this.doc = new Y.Doc();
        this.provider = new WebrtcProvider('musical-multiverse', this.doc);

        this.players = this.doc.getMap('players');
        this.stepSequencers = this.doc.getMap('stepSequencers');

        // observe changes in players map
        this.players.observe((event: Y.YMapEvent<any>): void => {
            event.changes.keys.forEach((change, key) => {
                if (change.action === 'add') {
                    const playerData: NetworkPlayer = this.players.get(key);
                    console.log(`Property "${key}" was added. Value: "${this.players.get(key)}".`);
                    this.app.addRemotePlayer(playerData);
                } else if (change.action === 'update') {
                    // check difference between old and new value ??
                    // console.log(`Property "${key}" was updated. New value: "${players.get(key)}". Previous value: "${change.oldValue}".`)
                    const playerData = this.players.get(key);
                    this.app.updateRemotePlayer(playerData);
                } else if (change.action === 'delete') {
                    console.log(`Property "${key}" was deleted. New value: undefined. Previous value: "${change.oldValue}".`)
                }
            });
        });

        // observe changes in audioObjects map
        this.stepSequencers.observe((event: Y.YMapEvent<any>): void => {
            event.changes.keys.forEach((change, key) => {
                if (change.action === 'add') {
                    const stepSequencerData: NetworkStepSequencer = this.stepSequencers.get(key);
                    console.log(`Property "${key}" was added in audioObject. Value: "${this.stepSequencers.get(key)}".`);
                    this.app.addRemoteStepSequencer(stepSequencerData);
                } else if (change.action === 'update') {
                    // check difference between old and new value ??
                    // console.log(`Property "${key}" was updated. New value: "${audioObjects.get(key)}". Previous value: "${change.oldValue}".`)
                    const stepSequencerData = this.stepSequencers.get(key);
                    this.app.updateRemoteStepSequencer(stepSequencerData);
                }
            });
        });
    }

    updatePlayer(playerData: NetworkPlayer): void {
        this.players.set(playerData.id, playerData);
    }

    updateStepSequencer(stepSequencerData: NetworkStepSequencer): void {
        this.stepSequencers.set(stepSequencerData.id, stepSequencerData);
    }
}