import type { WamEvent, WamMidiEvent } from "@webaudiomodules/api";
import type { Node3DFactory } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import { AbstractNetworkN3D, NetworkN3DGUI } from "./AbstractNetworkN3D";

/** The MIDI messages a MidiNetwork received, as their bytes. */
type MidiPayload = number[][]


/** A network node of MIDI: the notes played into one come out of the others. */
export class MidiNetworkN3D extends AbstractNetworkN3D<MidiPayload> {

    private output

    constructor(context: Node3DContext, gui: NetworkN3DGUI){
        super(context, gui)
        const {tools:T} = context

        // The upstream nodes deliver their events by calling scheduleEvents on the node connected
        // to their output, so this stand-in is enough to receive them.
        const receiver = {
            instanceId: `midi-network-${crypto.randomUUID()}`,
            context: context.audioCtx,
            scheduleEvents: (...events: WamEvent[]) => this.receive(events.flat()),
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

    /** Shares the MIDI messages among the events, the other kinds of events are not shared. */
    private receive(events: WamEvent[]){
        const midi = events
            .filter((event): event is WamMidiEvent => event.type === "wam-midi")
            .map(event => Array.from(event.data.bytes))
        if (midi.length === 0) return
        this.share(midi)
    }

    protected read(payload: unknown): MidiPayload | null {
        return Array.isArray(payload) ? payload : null
    }

    protected play(midi: MidiPayload){
        // The time of the sender's audio clock means nothing here: the events are played now.
        const time = this.context.audioCtx.currentTime
        const events: WamMidiEvent[] = midi.map(bytes => ({
            type: "wam-midi",
            time,
            data: { bytes: [bytes[0], bytes[1], bytes[2]] },
        }))
        for (const node of this.output.connections) node.scheduleEvents(...events)
    }
}


export const MidiNetworkN3DFactory: Node3DFactory<NetworkN3DGUI, MidiNetworkN3D> = {

    label: "MIDI Network",

    description: "Shares MIDI between the players: the MIDI it receives comes out, on every player's side, of the MIDI Networks listening on its channel.",

    tags: ["midi", "network", "technical"],

    createGUI: async (context) => new NetworkN3DGUI(context, {
        name: "midi network",
        logoColor: new context.babylon.Color3(.2, .85, .35),
        portColor: context.tools.MidiN3DConnectable.Color,
    }),

    create: async (context, gui) => new MidiNetworkN3D(context, gui),
}
