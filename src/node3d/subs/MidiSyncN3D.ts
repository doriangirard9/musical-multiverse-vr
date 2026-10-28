import type { WamEvent, WamMidiEvent } from "@webaudiomodules/api";
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DContext } from "../Node3DContext";
import type { Node3DGUIContext } from "../Node3DGUIContext";

/** What a MidiSync node sends to its copies on the other clients: the MIDI messages it received. */
type MidiSyncMessage = { midi: number[][] }


export class MidiSyncN3DGUI implements Node3DGUI {

    root
    block
    input
    output

    get worldSize(){ return 1 }

    constructor(context: Node3DGUIContext){
        const {babylon:B, tools:T} = context

        this.root = new B.TransformNode("midi sync root", context.scene)

        this.block = B.CreateBox("midi sync block", {width:1, depth:1, height:.5}, context.scene)
        this.block.parent = this.root
        this.block.material = context.materialMat
        this.block.position.set(0,-.25,0)

        this.input = T.ConnectableUtils.createInputMesh("midi sync input", .5, context.scene)
        T.MeshUtils.setColor(this.input, T.MidiN3DConnectable.Color.toColor4())
        this.input.parent = this.root
        this.input.material = context.materialMat
        this.input.position.set(-0.75,-.25,0)

        this.output = T.ConnectableUtils.createOutputMesh("midi sync output", .5, context.scene)
        T.MeshUtils.setColor(this.output, T.MidiN3DConnectable.Color.toColor4())
        this.output.parent = this.root
        this.output.material = context.materialMat
        this.output.position.set(0.75,-.25,0)
    }

    async dispose(){ }
}


/**
 * Shares MIDI between the clients. The MIDI received on its input is sent as a message to the same
 * node on every client, the sender included, and each one plays it on its output. So the output
 * plays the same notes everywhere, whoever played them.
 */
export class MidiSyncN3D implements Node3D {

    private output

    constructor(private context: Node3DContext, gui: MidiSyncN3DGUI){
        const {tools:T} = context

        context.addToBoundingBox(gui.block)

        // The upstream nodes deliver their events by calling scheduleEvents on the node connected
        // to their output, so this stand-in is enough to receive them.
        const receiver = {
            instanceId: `midi-sync-${crypto.randomUUID()}`,
            context: context.audioCtx,
            scheduleEvents: (...events: WamEvent[]) => this.send(events.flat()),
        }

        context.createConnectable(new T.MidiN3DConnectable.Input(
            "midi_input",
            [gui.input],
            "MIDI Input",
            receiver as any,
        ))

        this.output = new T.MidiN3DConnectable.ListOutput(
            "midi_output",
            [gui.output],
            "MIDI Output",
        )
        context.createConnectable(this.output)
    }

    /** Sends the MIDI messages among the events, the other kinds of events are not shared. */
    private send(events: WamEvent[]){
        const midi = events
            .filter((event): event is WamMidiEvent => event.type === "wam-midi")
            .map(event => Array.from(event.data.bytes))
        if (midi.length === 0) return
        this.context.sendMessage({ midi } satisfies MidiSyncMessage)
    }

    onMessage(message: unknown){
        if (typeof message !== "object" || message === null || !("midi" in message)) return
        const midi = (message as MidiSyncMessage).midi
        if (!Array.isArray(midi)) return

        // The time of the sender's audio clock means nothing here: the events are played now.
        const time = this.context.audioCtx.currentTime
        const events: WamMidiEvent[] = midi.map(bytes => ({
            type: "wam-midi",
            time,
            data: { bytes: [bytes[0], bytes[1], bytes[2]] },
        }))
        for (const node of this.output.connections) node.scheduleEvents(...events)
    }

    async setState(){ }

    async getState(){ }

    getStateKeys(){ return [] }

    async dispose(){ }
}


export const MidiSyncN3DFactory: Node3DFactory<MidiSyncN3DGUI, MidiSyncN3D> = {

    label: "MIDI Sync",

    description: "Shares MIDI between the players: the MIDI it receives comes out of its output on every player's side.",

    tags: ["midi", "sync", "network", "technical"],

    createGUI: async (context) => new MidiSyncN3DGUI(context),

    create: async (context, gui) => new MidiSyncN3D(context, gui),
}
