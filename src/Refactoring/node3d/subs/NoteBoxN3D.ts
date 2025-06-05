import {Node3D, Node3DFactory, Node3DGUI} from "../Node3D";
import {Node3DGUIContext} from "../Node3DGUIContext";
import {Node3DContext} from "../Node3DContext";
import {TransformNode, Color3, Mesh, Color4} from "@babylonjs/core";
import {Node3DButton} from "../Node3DButton";

interface MockWamNode {
    instanceId: string;
    context: AudioContext;
    scheduleEvents: (event: any) => void;
}

export class NoteBoxN3DGUI implements Node3DGUI {
    root: TransformNode;
    base;
    worldSize: number;
    output;
    input;
    padsContainer: TransformNode;
    pads: Mesh[] = [];
    sampleCapsules: Mesh[] = [];
    private context: Node3DGUIContext;

    constructor(context: Node3DGUIContext) {
        const {babylon: B, tools: T} = context;
        this.context = context;

        this.root = new TransformNode("note box root");
        this.worldSize = 1;

        this.base = B.CreateBox("note box", {size: 1}, context.scene);
        T.MeshUtils.setColor(this.base, new B.Color4(0.5, 0.5, 0.5, 1));
        this.base.parent = this.root;

        this.output = B.CreateSphere("note box output", {diameter: 0.5}, context.scene);
        T.MeshUtils.setColor(this.output, T.MidiN3DConnectable.OutputColor.toColor4());
        this.output.parent = this.root;
        this.output.position.x = 1;

        this.input = B.CreateSphere("note box input", {diameter: 0.5}, context.scene);
        T.MeshUtils.setColor(this.input, T.MidiN3DConnectable.InputColor.toColor4());
        this.input.parent = this.root;
        this.input.position.x = -1;

        this.padsContainer = new TransformNode("pads container");
        this.padsContainer.parent = this.root;
        this.padsContainer.position.y = 1;
        this.createPadGrid(4, 4);
    }

    private createPadGrid(rows: number, cols: number) {
        const {babylon: B, tools: T} = this.context;
        const padSize = 0.3;
        const spacing = 0.1;
        const totalWidth = cols * padSize + (cols - 1) * spacing;
        const totalDepth = rows * padSize + (rows - 1) * spacing;
        const startX = -totalWidth / 2 + padSize / 2;
        const startZ = -totalDepth / 2 + padSize / 2;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const pad = B.CreateBox(`pad_${row}_${col}`, {size: padSize, height: 0.1}, this.context.scene);
                T.MeshUtils.setColor(pad, new B.Color4(0.3, 0.3, 0.3, 1));
                pad.parent = this.padsContainer;
                pad.position.x = startX + col * (padSize + spacing);
                pad.position.z = startZ + row * (padSize + spacing);
                pad.position.y = 0;
                this.pads.push(pad);
            }
        }
    }

    createSampleCapsule(sampleIndex: number, totalSamples: number): Mesh {
        const {babylon: B, tools: T} = this.context;
        const capsule = B.CreateCylinder(`sample_${sampleIndex}`, {
            diameter: 0.6,
            height: 0.2,
            tessellation: 16
        }, this.context.scene);

        capsule.isPickable = true
        const hue = (sampleIndex / Math.max(totalSamples, 1)) * 0.8;
        const color = B.Color3.FromHSV(hue * 360, 0.7, 0.8);
        T.MeshUtils.setColor(capsule, new B.Color4(color.r, color.g, color.b, 0.8));

        capsule.parent = this.root;
        capsule.position.y = 1 + sampleIndex * 0.25;
        this.sampleCapsules.push(capsule);
        return capsule;
    }

    updatePadColor(padIndex: number, color: Color3) {
        const {tools: T} = this.context;
        if (padIndex >= 0 && padIndex < this.pads.length) {
            T.MeshUtils.setColor(this.pads[padIndex], new Color4(color.r, color.g, color.b, 1));
        }
    }

    async dispose() {
        this.sampleCapsules.forEach(capsule => capsule.dispose());
    }
}

interface Sample {
    id: number;
    events: any[];
    startTime: number;
    duration: number;
}

export class NoteBoxN3D implements Node3D {
    output;
    input;
    noteEvents: any[] = [];

    private samples: Sample[] = [];
    private currentSample: Sample | null = null;
    private lastEventTime: number = 0;
    private sampleThreshold: number = 2;
    private mockWamNode: MockWamNode;
    private padButtons: Node3DButton[] = [];
    private playingSampleIndex: number = -1;
    private playTimeouts: Set<any> = new Set();

    constructor(private context: Node3DContext, private gui: NoteBoxN3DGUI) {
        const {tools: T, audioCtx} = context;
        context.addToBoundingBox(gui.base);

        this.mockWamNode = this.createMockWamNode(audioCtx);

        this.output = new T.MidiN3DConnectable.ListOutput(
            "output",
            [gui.output],
            "Notes output",
        );
        context.createConnectable(this.output);

        this.input = new T.MidiN3DConnectable.Input(
            "midi input",
            [gui.input],
            "Notes input",
            this.mockWamNode as any
        );
        context.createConnectable(this.input);
        this.createPadButtons();
    }

    private createPadButtons() {
        this.gui.pads.forEach((padMesh, index) => {
            const button: Node3DButton = {
                id: `pad-button-${index}`,
                meshes: [padMesh],
                label: `Play sample ${index + 1}`,
                color: new Color3(0.3, 0.3, 0.3),
                press: () => {
                    if (index < this.samples.length) {
                        this.playingSampleIndex = index;
                        this.gui.updatePadColor(index, new Color3(1, 0, 0));
                        this.replaySample(index);

                        const sample = this.samples[index];
                        const duration = sample.duration || 1;

                        const timeout = setTimeout(() => {
                            if (this.playingSampleIndex === index) {
                                this.gui.updatePadColor(index, new Color3(0.2, 0.8, 0.2));
                                this.playingSampleIndex = -1;
                            }
                            this.playTimeouts.delete(timeout);
                        }, duration * 1000);

                        this.playTimeouts.add(timeout);
                    }
                },
                release: () => {}
            };
            this.padButtons.push(button);
            this.context.createButton(button);
        });
    }

    private createMockWamNode(audioCtx: AudioContext): MockWamNode {
        return {
            instanceId: `note-box-${Date.now()}`,
            context: audioCtx,

            scheduleEvents: (events: any) => {
                const eventsArray = Array.isArray(events) ? events : [events];
                for (const event of eventsArray) {
                    this.noteEvents.push(event);
                    const eventTime = event.time || 0;
                    if (!this.currentSample || (eventTime - this.lastEventTime) > this.sampleThreshold) {
                        if (this.currentSample && this.currentSample.events.length > 0) {
                            this.currentSample.duration = this.lastEventTime - this.currentSample.startTime;
                        }

                        this.currentSample = {
                            id: this.samples.length,
                            events: [],
                            startTime: eventTime,
                            duration: 0
                        };
                        this.samples.push(this.currentSample);

                        this.gui.createSampleCapsule(this.samples.length - 1, 16);
                        /**
                         * TODO : Ajouter une bb ou un drag + shake behavior sur les capsules pour pouvoir delete un sample
                         *      Supprimer sample + capsule + reset le pad. réorganiser les samples ?
                         */
                        if (this.samples.length <= this.gui.pads.length) {
                            this.gui.updatePadColor(this.samples.length - 1, new Color3(0.2, 0.8, 0.2));
                        }
                    }

                    if (this.currentSample) {
                        this.currentSample.events.push(event);
                        this.lastEventTime = eventTime;
                        this.currentSample.duration = eventTime - this.currentSample.startTime;
                    }
                }

                this.forwardEventsToOutput(events);
            },

        };
    }

    private forwardEventsToOutput(events: any) {
        for (const wamNode of this.output.connections) {
            if (wamNode.scheduleEvents) {
                wamNode.scheduleEvents(events);
            }
        }
    }

    replaySample(sampleIndex: number): void {
        if (sampleIndex < 0 || sampleIndex >= this.samples.length) return;

        const sample = this.samples[sampleIndex];
        if (sample.events.length === 0) return;

        const currentTime = this.mockWamNode.context.currentTime;
        const sampleStartTime = sample.events[0].time || 0;

        for (const event of sample.events) {
            const relativeTime = (event.time || 0) - sampleStartTime;
            const eventCopy = {
                ...event,
                time: currentTime + relativeTime
            };

            this.forwardEventsToOutput(eventCopy);
        }
    }

    async setState(key: string, state: any): Promise<void> {}

    async getState(key: string): Promise<any> {}

    getStateKeys(): string[] {
        return [];
    }

    async dispose(): Promise<void> {
        this.playTimeouts.forEach(timeout => clearTimeout(timeout));
        this.playTimeouts.clear();

        this.noteEvents = [];
        this.samples = [];
        this.currentSample = null;
    }
}

export const NoteBoxN3DFactory : Node3DFactory<NoteBoxN3DGUI, NoteBoxN3D> = {
    label : "NoteBox",

    createGUI: async (context: Node3DGUIContext) : Promise<NoteBoxN3DGUI> => {
        return new NoteBoxN3DGUI(context);
    },

    create : async (context: Node3DContext, gui: NoteBoxN3DGUI) : Promise<NoteBoxN3D> => new NoteBoxN3D(context, gui),
}