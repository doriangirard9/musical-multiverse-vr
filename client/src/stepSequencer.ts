import * as B from '@babylonjs/core';
import * as Tone from "tone";
import * as GUI from "@babylonjs/gui";
import { NetworkStepSequencer } from "./models";
import Network from "./network";

export default class StepSequencer {
    private mesh: B.Mesh;
    public isPlaying: boolean = false;
    private grid: any[] = this.makeGrid(["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]);
    private gridButtons: GUI.Button[][] = [];
    private synths: Tone.Synth[];
    private beat: number = 0;
    private bpmSlider: GUI.Slider;
    private wamInstance: any;
    private audioCtx: AudioContext = new AudioContext();

    constructor(private scene: B.Scene, public id: string, private network: Network) {
        Tone.setContext(this.audioCtx);
        this.synths = this.grid.map((row) => new Tone.Synth());

        this.createMesh();
        this.configLoop();
        // this.initWAM().then(() => { console.log("WAM initialized"); });
    }

    createMesh(): void {
        this.mesh = B.MeshBuilder.CreatePlane(`stepSequencer`, { width: 1, height: 1 }, this.scene);

        const ui: GUI.AdvancedDynamicTexture = GUI.AdvancedDynamicTexture.CreateForMesh(this.mesh, 1024, 1024, false);

        // panel
        const panel: GUI.StackPanel = new GUI.StackPanel();
        panel.width = '800px';
        panel.height = '1000px';
        ui.addControl(panel);

        // bpm slider
        this.bpmSlider = new GUI.Slider();
        this.bpmSlider.minimum = 60;
        this.bpmSlider.maximum = 180;
        this.bpmSlider.value = 120;
        this.bpmSlider.height = '50px';
        this.bpmSlider.width = '100%';
        this.bpmSlider.color = 'green';
        this.bpmSlider.background = 'white';
        this.bpmSlider.onValueChangedObservable.add((value) => {
            // update local state
            Tone.Transport.bpm.value = value;
            // update network state
            this.sendStateToNetwork();
        });
        panel.addControl(this.bpmSlider);

        // grid
        const grid = new GUI.Grid();
        grid.width = '800px';
        grid.height = '800px';
        for (let i = 0; i < this.grid.length; i++) {
            grid.addColumnDefinition(800 / 8, true);
        }
        for (let i = 0; i < this.grid[0].length; i++) {
            grid.addRowDefinition(800 / 8, true);
        }
        panel.addControl(grid);

        // grid buttons
        for (let i = 0; i < this.grid.length; i++) {
            this.gridButtons.push([]);
            for (let j = 0; j < this.grid[i].length; j++) {
                const button: GUI.Button = GUI.Button.CreateSimpleButton('button', this.grid[i][j].note);
                button.width = '100%';
                button.height = '100%';
                button.color = 'white';
                button.background = 'green';
                button.fontSize = 50;
                button.onPointerUpObservable.add(() => {
                    // update local state
                    this.grid[i][j].isActive = !this.grid[i][j].isActive;
                    this.updateButtonState(button, this.grid[i][j].isActive);
                    // update network state
                    this.sendStateToNetwork();
                });
                grid.addControl(button, i, j);
                this.gridButtons[i].push(button);
            }
        }

        // play button
        const playButton = GUI.Button.CreateSimpleButton('button', 'Play');
        playButton.height = '100px';
        playButton.width = '100%';
        playButton.color = 'white';
        playButton.cornerRadius = 20;
        playButton.background = 'green';
        playButton.fontSize = 50;
        playButton.onPointerUpObservable.add((): void => {
            // start or stop playing
            if (this.isPlaying) {
                this.stop();
            }
            else {
                this.play();
            }
            // update network state
            this.sendStateToNetwork();
        });
        panel.addControl(playButton);
    }

    sendStateToNetwork(): void {
        this.network.updateStepSequencer({
            id: this.id,
            position: {
                x: this.mesh.position.x,
                y: this.mesh.position.y,
                z: this.mesh.position.z
            },
            isPlaying: this.isPlaying,
            grid: this.grid.map((row) => row.map((note) => note.isActive)),
            bpm: this.bpmSlider.value
        } as NetworkStepSequencer);
    }

    updatePosition(position: { x: number, y: number, z: number }): void {
        this.mesh.position = new B.Vector3(position.x, position.y, position.z);
    }

    updateGridState(gridData: boolean[][]): void {
        for (let i = 0; i < this.grid.length; i++) {
            for (let j = 0; j < this.grid[i].length; j++) {
                this.grid[i][j].isActive = gridData[i][j];
                this.updateButtonState(this.gridButtons[i][j], this.grid[i][j].isActive);
            }
        }
    }

    update(stepSequencerData: NetworkStepSequencer): void {
        this.updatePosition(stepSequencerData.position);

        this.updateGridState(stepSequencerData.grid);

        if (stepSequencerData.isPlaying) {
            this.play();
        }
        else {
            this.stop();
        }

        this.bpmSlider.value = stepSequencerData.bpm;
        Tone.Transport.bpm.value = stepSequencerData.bpm;
    }

    updateButtonState(button: GUI.Button, isActive: boolean): void {
        if (isActive) {
            button.background = 'red';
        }
        else {
            button.background = 'green';
        }
    }

    destroy(): void {
        this.mesh.dispose();
    }

    play(): void {
        if (this.isPlaying) return;
        Tone.Transport.start();
        this.isPlaying = true;
    }

    stop(): void {
        if (!this.isPlaying) return;
        Tone.Transport.stop();
        this.isPlaying = false;
    }

    makeGrid(notes: string[]): any[] {
        const rows = [];

        for (const note of notes) {
            const row = [];
            for (let i = 0; i < 8; i++) {
                row.push({
                    note: note,
                    isActive: false
                });
            }
            rows.push(row);
        }

        return rows;
    }

    configLoop(): void {
        const repeat = (time: Tone.Unit.Time) => {

            this.grid.forEach((row, index) => {
                let synth: Tone.Synth<Tone.SynthOptions> = this.synths[index];
                let note = row[this.beat];

                if (note.isActive) {
                    synth.triggerAttackRelease(note.note, "8n", time);
                    this.playButtonAnim(this.gridButtons[index][this.beat]);
                }
            });
            this.beat = (this.beat + 1) % 8;
        };

        Tone.Transport.scheduleRepeat(repeat, "8n");
    };

    playButtonAnim(button: GUI.Button): void {
        button.background = 'blue';
        setTimeout(() => {
            button.background = 'red';
        }, 100);
    }

    private async initWAM(): Promise<void> {
        // Init WamEnvironment
        const scriptUrl: string = 'https://mainline.i3s.unice.fr/wam2/packages/sdk/src/initializeWamHost.js';
        const { default: initializeWamHost } = (await import(/* webpackIgnore: true */ scriptUrl)) as any;
        const [hostGroupId] = await initializeWamHost(this.audioCtx);
        // // Import WAM
        const wamUrl: string = 'https://www.webaudiomodules.com/community/plugins/wimmics/BigMuff/index.js';
        const { default: WAM } = (await import(/* webpackIgnore: true */ wamUrl)) as any;
        // // // Create a new instance of the plugin
        const instance = await WAM.createInstance(hostGroupId, this.audioCtx);
        this.wamInstance = instance;
        // set audionode parameter
        this.wamInstance.audioNode.setParamValue("/BigMuff/Drive", 100);
        // // // Connect the audionode to the host
          this.synths.forEach((synth) => {
                synth.connect(this.wamInstance.audioNode);
          });
        this.wamInstance.audioNode.connect(this.audioCtx.destination);
    }
}