import App from "./app";
import * as Tone from "tone";

window.onload = (): void => { init(); }

window.addEventListener('click', async () => {
    if (Tone.context.state !== 'suspended') return;
    await Tone.start();
}, { once: true });

const init = async () => {
    const app = new App();
    app.startScene();

    // const { default: initializeWamHost } = await import("https://mainline.i3s.unice.fr/wam2/packages/sdk/src/initializeWamHost.js");
}

// import { io } from "socket.io-client";
// import * as B from "@babylonjs/core";
// import * as GUI from "@babylonjs/gui";
// import * as Tone from "tone";
// // Enable GLTF/GLB loader for loading controller models from WebXR Input registry
// import '@babylonjs/loaders/glTF';
// import '@babylonjs/core/Materials/Node/Blocks'
// import {Listener} from "tone";
// import * as Y from 'yjs';
// // import { WebsocketProvider } from 'y-websocket';
// import { WebrtcProvider } from 'y-webrtc';
// import Player from "./player";
// import { NetworkPlayer, NetworkStepSequencer } from "./models";
//
// // temporary (for testing)
// const id: string = Math.random().toString(36).substring(7);
// console.log(id);
//
// let scene: B.Scene;
// let playerObjects: Player[] = [];
// let audioObjects: AudioObject[] = [];
//
// const addPlayer = (playerData: NetworkPlayer) => {
//     // create new player
//     const player = new Player(playerData.id, scene);
//     player.update(playerData);
//     playerObjects.push(player);
// }
//
// const updatePlayer = (id: string, playerData: NetworkPlayer) => {
//     const player = playerObjects.find((player) => player.id === id);
//     if (player) {
//         player.update(playerData);
//     }
// }
//
// const addAudioObject = (id: string, audioObjectData: NetworkStepSequencer) => {
//     // create new audio object
//     const audioObject = new AudioObject(scene, id);
//     audioObject.updatePosition(audioObjectData.position);
//     if (audioObjectData.isPlaying) {
//         audioObject.play();
//     }
//     audioObjects.push(audioObject);
// }
//
// const updateAudioObject = (id: string, audioObjectData: NetworkStepSequencer) => {
//     const audioObject = audioObjects.find((audioObject) => audioObject.id === id);
//     if (audioObject) {
//         // update audio object position
//         audioObject.updatePosition(audioObjectData.position);
//         // update audio object state
//         if (audioObjectData.isPlaying) {
//             audioObject.play();
//         }
//         else {
//             audioObject.stop();
//         }
//     }
// }
//
// const removeAudioObject = (id: string) => {
//     const audioObject: AudioObject = audioObjects.find((audioObject) => audioObject.id === id);
//     if (audioObject) {
//         // remove audio object
//         audioObject.destroy();
//         audioObjects = audioObjects.filter((audioObject) => audioObject.id !== id);
//     }
// }
//
// // const socket = io();
// //
// // socket.on("connect", () => {
// //     console.log("connected to server");
// // });
// //
// // socket.on("addPlayers", (_players: PlayerData[]) => {
// //     // create new players
// //     _players.forEach((player) => {
// //         if (player.id !== socket.id) {
// //             players.push(new Player(player.id));
// //         }
// //     });
// // });
// //
// // socket.on("updatePlayerData", (playerData: PlayerData) => {
// //     const player = players.find((player) => player.id === playerData.id);
// //     if (player) {
// //         player.updatePosition(playerData.position);
// //         player.updateDirection(playerData.direction);
// //         player.updateLeftHandPosition(playerData.leftHandPosition);
// //         player.updateRightHandPosition(playerData.rightHandPosition);
// //     }
// // });
//
// window.onload = () => { createScene(); }
//
// window.addEventListener('click', async () => {
//     if (Tone.context.state !== 'suspended') return;
//     await Tone.start();
//     console.log(Tone.context.state);
// }, { once: true });
//
// let leftController: B.AbstractMesh;
// let rightController: B.AbstractMesh;
// let audioCtx: AudioContext;
// let guiContainer: B.AbstractMesh;
// let audio: Y.Map<NetworkStepSequencer>;
//
// const createScene = async () => {
//     const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
//
//     const engine = new B.Engine(canvas, true);
//     scene = new B.Scene(engine);
//
//     const doc: Y.Doc = new Y.Doc();
//
//     const provider: WebrtcProvider = new WebrtcProvider('dorian-room', doc);
//     // const wsProvider: WebsocketProvider = new WebsocketProvider('ws://localhost:1234', 'dorian-room', doc);
//
//     const players: Y.Map<NetworkPlayer> = doc.getMap('players');
//     audio = doc.getMap('audioObjects');
//
//     // observe changes in players map
//     players.observe((event: Y.YMapEvent<any>): void => {
//         event.changes.keys.forEach((change, key) => {
//             if (change.action === 'add') {
//                 const playerData = players.get(key);
//                 if (playerData.id !== id) {
//                     console.log(`Property "${key}" was added. Value: "${players.get(key)}".`);
//                     addPlayer(playerData);
//                 }
//             } else if (change.action === 'update') {
//                 // check difference between old and new value ??
//                 // console.log(`Property "${key}" was updated. New value: "${players.get(key)}". Previous value: "${change.oldValue}".`)
//                 const playerData = players.get(key);
//                 updatePlayer(playerData.id, playerData);
//             } else if (change.action === 'delete') {
//                 console.log(`Property "${key}" was deleted. New value: undefined. Previous value: "${change.oldValue}".`)
//             }
//         });
//     });
//
//     // add player to the list
//     players.set(id, {
//             id: id,
//             position: {
//                 x: 0,
//                 y: 0,
//                 z: 0
//             },
//             direction: {
//                 x: 0,
//                 y: 0,
//                 z: 0
//             },
//             leftHandPosition: {
//                 x: 0,
//                 y: 0,
//                 z: 0
//             },
//             rightHandPosition: {
//                 x: 0,
//                 y: 0,
//                 z: 0
//             }
//         });
//
//     // observe changes in audioObjects map
//     audio.observe((event: Y.YMapEvent<any>): void => {
//         event.changes.keys.forEach((change, key) => {
//             if (change.action === 'add') {
//                 const audioObjectData = audio.get(key);
//                 console.log(`Property "${key}" was added in audioObject. Value: "${audio.get(key)}".`);
//                 addAudioObject(audioObjectData.id, audioObjectData);
//             } else if (change.action === 'update') {
//                 // check difference between old and new value ??
//                 // console.log(`Property "${key}" was updated. New value: "${audioObjects.get(key)}". Previous value: "${change.oldValue}".`)
//                 console.log(audio.get(key));
//                 const audioObjectData = audio.get(key);
//                 updateAudioObject(audioObjectData.id, audioObjectData);
//             } else if (change.action === 'delete') {
//                 console.log(`Property "${key}" was deleted in audioObject. New value: undefined. Previous value: "${change.oldValue}".`);
//                 removeAudioObject(key);
//             }
//         });
//     });
//
//     const light = new B.HemisphericLight('light', new B.Vector3(0, 1, 0), scene);
//
//     // // get babylon audio engine
//     // const audioEngine = new BABYLON.AudioEngine();
//     // audioCtx = audioEngine.audioContext;
//
//     const listener = Tone.getListener();
//     const panner3d = new Tone.Panner3D().toDestination();
//
//     const synth = new Tone.Synth();
//     synth.connect(panner3d);
//
//     // const seq = new Tone.Sequence((time, note) => {
//     //     synth.triggerAttackRelease(note, 0.1, time);
//     // }, ["C4", ["E4", "D4", "E4"], "G4", ["A4", "G4"]]).start(0);
//     // Tone.Transport.start();
//
//     const isSupported = await B.WebXRSessionManager.IsSessionSupportedAsync('immersive-ar');
//     if (!isSupported) {
//         alert('WebXR is not supported on this browser');
//         return;
//     }
//     // create ground
//     const ground = B.MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, scene);
//     const groundMaterial = new B.StandardMaterial('groundMaterial', scene);
//     groundMaterial.diffuseColor = B.Color3.Gray();
//     ground.material = groundMaterial;
//
//     const xrHelper = await scene.createDefaultXRExperienceAsync({ floorMeshes: [ground] });
//
//     // get motion controllers
//     xrHelper.input.onControllerAddedObservable.add((controller : B.WebXRInputSource) => {
//         controller.onMotionControllerInitObservable.add((motionController : B.WebXRAbstractMotionController) => {
//             if (motionController.handedness === 'left') {
//                 leftController = controller.grip;
//             }
//             else if (motionController.handedness === 'right') {
//                 rightController = controller.grip;
//                 const xr_ids = motionController.getComponentIds();
//                 let abuttonComponent = motionController.getComponent(xr_ids[3]);//a-button
//                 abuttonComponent.onButtonStateChangedObservable.add(() => {
//                     if (abuttonComponent.pressed) {
//                         if (guiContainer) {
//                             deleteUI();
//                         }
//                         else {
//                             // the position is in front of the camera
//                             const position: B.Vector3 = xrHelper.baseExperience.camera.getFrontPosition(0.5);
//                             const target: B.Vector3 = xrHelper.baseExperience.camera.position;
//                             createUI(position, target);
//                         }
//                     }
//                 });
//             }
//         });
//     });
//
//     const featureManager = xrHelper.baseExperience.featuresManager;
//     // // enable teleportation
//     // const teleportation = featureManager.enableFeature(B.WebXRFeatureName.TELEPORTATION, 'stable', {
//     //     xrInput: xrHelper.input,
//     //     floorMeshes: [ground]
//     // });
//     // enable hand tracking
//     // featureManager.enableFeature(B.WebXRFeatureName.HAND_TRACKING, "latest", {
//     //     xrInput: xrHelper.input
//     // });
//     featureManager.disableFeature(B.WebXRFeatureName.TELEPORTATION);
//     featureManager.enableFeature(B.WebXRFeatureName.MOVEMENT, "latest", {
//         xrInput: xrHelper.input,
//         floorMeshes: [ground],
//         movementSpeed: 0.2,
//         rotationSpeed: 0.3,
//     });
//
//     engine.runRenderLoop(() => {
//         const xrCameraPosition = xrHelper.baseExperience.camera.position;
//         const xrCameraDirection = xrHelper.baseExperience.camera.getDirection(B.Axis.Z);
//         // console.log(xrHelper.baseExperience.camera.getDirection(BABYLON.Axis.Z))
//         // console.log(xrHelper.baseExperience.camera.getDirection(BABYLON.Axis.X));
//         // console.log(xrHelper.baseExperience.camera.getDirection(BABYLON.Axis.Y));
//         // send new player data to server
//         // if (leftController && rightController) {
//         //     socket.emit("changePlayerData",
//         //         { x: xrCameraPosition.x, y: xrCameraPosition.y, z: xrCameraPosition.z },
//         //         { x: xrCameraDirection.x, y: xrCameraDirection.y, z: xrCameraDirection.z },
//         //         { x: leftController.position.x + 0.05, y: leftController.position.y, z: leftController.position.z - 0.2},
//         //         { x: rightController.position.x - 0.05, y: rightController.position.y, z: rightController.position.z - 0.2}
//         //     );
//         // }
//         // update player data
//         if (leftController && rightController) {
//             players.set(id, {
//                 id: id,
//                 position: {
//                     x: xrCameraPosition.x,
//                     y: xrCameraPosition.y,
//                     z: xrCameraPosition.z
//                 },
//                 direction: {
//                     x: xrCameraDirection.x,
//                     y: xrCameraDirection.y,
//                     z: xrCameraDirection.z
//                 },
//                 leftHandPosition: {
//                     x: leftController.position.x + 0.05,
//                     y: leftController.position.y,
//                     z: leftController.position.z - 0.2
//                 },
//                 rightHandPosition: {
//                     x: rightController.position.x - 0.05,
//                     y: rightController.position.y,
//                     z: rightController.position.z - 0.2
//                 }
//             });
//         }
//
//         // change listener position
//         listener.positionX.value = xrCameraPosition.x;
//         listener.positionY.value = xrCameraPosition.y;
//         listener.positionZ.value = xrCameraPosition.z;
//
//         // change listener direction
//         listener.forwardX.value = xrCameraDirection.x;
//         listener.forwardY.value = xrCameraDirection.y;
//         listener.forwardZ.value = xrCameraDirection.z;
//         scene.render();
//     });
// }
//
// const createUI = (position: B.Vector3, target: B.Vector3) => {
//     guiContainer = B.MeshBuilder.CreatePlane('guiContainer', { width: 1, height: 1 }, scene);
//     guiContainer.position = position;
//     guiContainer.lookAt(target);
//     guiContainer.rotate(B.Axis.Y, Math.PI, B.Space.LOCAL);
//
//     const gui: GUI.AdvancedDynamicTexture = GUI.AdvancedDynamicTexture.CreateForMesh(guiContainer, 1024, 1024, false);
//
//     const button = GUI.Button.CreateSimpleButton('button', 'Create sequencer');
//     button.width = '150px';
//     button.height = '40px';
//     button.color = 'white';
//     button.cornerRadius = 20;
//     button.background = 'green';
//     button.onPointerUpObservable.add(() => {
//         const audioId: string = Math.random().toString(36).substring(7);
//         // add audioObject to the list
//         audio.set(audioId, {
//             id: audioId,
//             position: {
//                 x: 0,
//                 y: 2,
//                 z: 0
//             },
//             isPlaying: false
//         });
//     });
//     gui.addControl(button);
// }
//
// const deleteUI = () => {
//     if (guiContainer) {
//         guiContainer.dispose();
//         guiContainer = null;
//     }
// }
//
// class AudioObject {
//     private _mesh: B.Mesh;
//     isPlaying: boolean = false;
//     grid: any[] = this.makeGrid(["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]);
//     synths: Tone.Synth[] = this.grid.map((row) => new Tone.Synth().toDestination());
//     beat: number = 0;
//
//     constructor(private scene: B.Scene, public id: string) {
//         this.createMesh();
//         this.configLoop();
//     }
//
//     createMesh(): void {
//         this._mesh = B.MeshBuilder.CreatePlane(`AudioObject`, { width: 1, height: 1 }, this.scene);
//
//         const ui: GUI.AdvancedDynamicTexture = GUI.AdvancedDynamicTexture.CreateForMesh(this._mesh, 1024, 1024, false);
//         const panel: GUI.StackPanel = new GUI.StackPanel();
//         panel.width = '300px';
//         panel.height = '400px';
//         ui.addControl(panel);
//
//         const grid = new GUI.Grid();
//         grid.width = '300px';
//         grid.height = '300px';
//         for (let i = 0; i < this.grid.length; i++) {
//             grid.addColumnDefinition(300 / 8, true);
//         }
//         for (let i = 0; i < this.grid[0].length; i++) {
//             grid.addRowDefinition(300 / 8, true);
//         }
//         panel.addControl(grid);
//         for (let i = 0; i < this.grid.length; i++) {
//             for (let j = 0; j < this.grid[i].length; j++) {
//                 const button = GUI.Button.CreateSimpleButton('button', this.grid[i][j].note);
//                 button.width = '100%';
//                 button.height = '100%';
//                 button.color = 'white';
//                 button.background = 'green';
//                 button.onPointerUpObservable.add(() => {
//                     this.grid[i][j].isActive = !this.grid[i][j].isActive;
//                     if (this.grid[i][j].isActive) {
//                         button.background = 'red';
//                     }
//                     else {
//                         button.background = 'green';
//                     }
//                 });
//                 grid.addControl(button, i, j);
//             }
//         }
//
//
//         const button = GUI.Button.CreateSimpleButton('button', 'Play');
//         button.height = '100px';
//         button.width = '100%';
//         button.color = 'white';
//         button.cornerRadius = 20;
//         button.background = 'green';
//         button.onPointerUpObservable.add(() => {
//             if (this.isPlaying) {
//                 this.stop();
//             }
//             else {
//                 this.play();
//             }
//         });
//         panel.addControl(button);
//     }
//
//     updatePosition(position: { x: number, y: number, z: number }): void {
//         this._mesh.position = new B.Vector3(position.x, position.y, position.z);
//     }
//
//     destroy(): void {
//         this._mesh.dispose();
//     }
//
//     play(): void {
//         if (this.isPlaying) return;
//
//         console.log('play');
//         Tone.Transport.start();
//         this.isPlaying = true;
//         audio.set(this.id, {
//             id: this.id,
//             position: {
//                 x: this._mesh.position.x,
//                 y: this._mesh.position.y,
//                 z: this._mesh.position.z
//             },
//             isPlaying: true
//         });
//     }
//
//     stop(): void {
//         if (!this.isPlaying) return;
//
//         console.log('stop');
//         Tone.Transport.stop();
//         this.isPlaying = false;
//         audio.set(this.id, {
//             id: this.id,
//             position: {
//                 x: this._mesh.position.x,
//                 y: this._mesh.position.y,
//                 z: this._mesh.position.z
//             },
//             isPlaying: false
//         });
//     }
//
//     makeGrid(notes: string[]): any[] {
//         const rows = [];
//
//         for (const note of notes) {
//             const row = [];
//             for (let i = 0; i < 8; i++) {
//                 row.push({
//                     note: note,
//                     isActive: false
//                 });
//             }
//             rows.push(row);
//         }
//
//         return rows;
//     }
//
//     configLoop(): void {
//         const repeat = (time: Tone.Unit.Time) => {
//
//             this.grid.forEach((row, index) => {
//                 let synth = this.synths[index];
//                 let note = row[this.beat];
//
//                 if (note.isActive) {
//                     synth.triggerAttackRelease(note.note, "8n", time);
//                 }
//             });
//             // increment the counter
//             this.beat = (this.beat + 1) % 8;
//         };
//
//         Tone.Transport.bpm.value = 120;
//         Tone.Transport.scheduleRepeat(repeat, "8n");
//     };
// }