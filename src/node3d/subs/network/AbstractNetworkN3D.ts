import type { Color3, Mesh } from "@babylonjs/core";
import type { Node3D, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";

/** What a network node sends to its copies on the other clients: what it received, and the channel it goes on. */
type NetworkMessage = { payload: unknown, channel: number }

/** The channels, the first one being ALL, which talks to every channel. */
const CHANNEL_LABELS = ["ALL", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
const ALL = 0

/** The controls on the front of the block, in GUI units. */
const CONTROL_SIZE = .18
const CONTROL_HEIGHT = .08
const CONTROL_ROW = -.3

/** The input and the output, on the sides of the block, in GUI units. */
const PORT_SIZE = .5
const PORT_X = .75


/** What tells the network nodes apart on sight. */
export interface NetworkN3DGUIOptions {
    name: string
    logoColor: Color3
    portColor: Color3
}


/** A flat block with a wifi logo, an input and an output on its sides, a switch and two channels on its front. */
export class NetworkN3DGUI implements Node3DGUI {

    root
    block
    logo
    switch
    send
    receive
    input
    output

    private readonly channelColors: Color3[]
    private readonly switchColors: [Color3, Color3]

    get worldSize(){ return 1 }

    constructor(private context: Node3DGUIContext, options: NetworkN3DGUIOptions){
        const {babylon:B, tools:T} = context
        const {name} = options

        this.channelColors = CHANNEL_LABELS.map((_, channel) =>
            channel === ALL ? new B.Color3(.05, .05, .05) : B.Color3.FromHSV((channel-1) * 40, .8, .95))
        this.switchColors = [new B.Color3(.35, .35, .35), new B.Color3(.3, .85, .4)]

        this.root = new B.TransformNode(`${name} root`, context.scene)

        this.block = B.CreateBox(`${name} block`, {width:1, depth:1, height:.2}, context.scene)
        this.block.parent = this.root
        this.block.material = context.materialMat
        this.block.position.set(0,-.1,0)

        // A wifi logo lying on the back of the block: a dot and three arcs around it.
        const parts = [B.CreateSphere(`${name} logo dot`, {diameter:.07}, context.scene)]
        for (const radius of [.12, .22, .32]) {
            const path = Array.from({length:17}, (_,i) => {
                const angle = Math.PI/4 + i/16 * Math.PI/2
                return new B.Vector3(Math.cos(angle)*radius, Math.sin(angle)*radius, 0)
            })
            parts.push(B.CreateTube(`${name} logo arc`, {path, radius:.025, cap:B.Mesh.CAP_ALL}, context.scene))
        }
        this.logo = B.Mesh.MergeMeshes(parts, true)!!
        T.MeshUtils.setColor(this.logo, options.logoColor.toColor4(1))
        this.logo.parent = this.root
        this.logo.material = context.materialMat
        this.logo.rotation.x = Math.PI/2
        this.logo.position.set(0,.025,-.02)

        // On the front: the send channel by the input, the switch, the receive channel by the output.
        this.send = this.createControl(`${name} send`, -.3)
        this.switch = this.createControl(`${name} switch`, 0)
        this.receive = this.createControl(`${name} receive`, .3)
        this.setEnabled(true)
        this.setSendChannel(ALL)
        this.setReceiveChannel(ALL)

        // A geodesic of a given size comes out about one and a half times as large as a sphere of that diameter.
        this.input = T.ConnectableUtils.createInputMesh(`${name} input`, PORT_SIZE, context.scene)
        T.MeshUtils.setColor(this.input, options.portColor.toColor4(1))
        this.input.parent = this.root
        this.input.material = context.materialMat
        this.input.position.set(-PORT_X,-.1,0)

        this.output = T.ConnectableUtils.createOutputMesh(`${name} output`, PORT_SIZE, context.scene)
        T.MeshUtils.setColor(this.output, options.portColor.toColor4(1))
        this.output.parent = this.root
        this.output.material = context.materialMat
        this.output.position.set(PORT_X,-.1,0)
    }

    private createControl(name: string, x: number): Mesh {
        const {babylon:B} = this.context
        const control = B.CreateBox(name, {width:CONTROL_SIZE, depth:CONTROL_SIZE, height:CONTROL_HEIGHT}, this.context.scene)
        control.parent = this.root
        control.material = this.context.materialMat
        control.position.set(x, CONTROL_HEIGHT/2, CONTROL_ROW)
        return control
    }

    /** Light the switch up or off. */
    setEnabled(on: boolean){
        this.context.tools.MeshUtils.setColor(this.switch, this.switchColors[on ? 1 : 0].toColor4(1))
    }

    setSendChannel(channel: number){
        this.context.tools.MeshUtils.setColor(this.send, this.channelColors[channel].toColor4(1))
    }

    setReceiveChannel(channel: number){
        this.context.tools.MeshUtils.setColor(this.receive, this.channelColors[channel].toColor4(1))
    }

    async dispose(){ }
}


/**
 * Shares something between the clients. What a network node gets on its input is sent as a message to the
 * same node on every client, the sender included, and each copy listening on its channel puts it out on
 * its output. So the output gives the same everywhere, whoever fed the input.
 *
 * @remarks
 * The channels are not synchronized: each player sets them for themselves on their copy, and a message
 * carries the send channel of the player whose input it came from. A copy listens to a channel when its
 * receive channel is the same, or when either one is ALL. So a player can take in only what one other
 * player sends, and send only to another.
 * The switch turns both ways off: a disabled network node neither sends nor puts out.
 *
 * An implementation creates its connectables on the meshes of the GUI, calls {@link share} with what
 * its input gets, and puts out on its output what {@link play} is given.
 */
export abstract class AbstractNetworkN3D<P> implements Node3D {

    private enabled = true
    private sendChannel = ALL
    private receiveChannel = ALL

    constructor(protected context: Node3DContext, gui: NetworkN3DGUI){
        const {tools:T} = context

        context.addToBoundingBox(gui.block)

        context.createParameter(new T.BooleanN3DParameter(
            "enabled", [gui.switch],
            value => { this.enabled = value; gui.setEnabled(value) },
            () => this.enabled,
            () => "Network",
        ))

        // The channels are each player's own: the same network node can send on one channel here and on another there.
        context.createParameter(Object.assign(new T.ChoiceN3DParameter(
            "send_channel", [gui.send], CHANNEL_LABELS.length,
            value => { this.sendChannel = value; gui.setSendChannel(value) },
            () => this.sendChannel,
            () => "Send channel",
            value => CHANNEL_LABELS[value],
        ), { notSynced: true }))

        context.createParameter(Object.assign(new T.ChoiceN3DParameter(
            "receive_channel", [gui.receive], CHANNEL_LABELS.length,
            value => { this.receiveChannel = value; gui.setReceiveChannel(value) },
            () => this.receiveChannel,
            () => "Receive channel",
            value => CHANNEL_LABELS[value],
        ), { notSynced: true }))
    }

    /** Sends what the input got to the copies listening on the send channel. */
    protected share(payload: P){
        if (!this.enabled) return
        this.context.sendMessage({ payload, channel: this.sendChannel } satisfies NetworkMessage)
    }

    /**
     * Reads a payload come from the network.
     * @returns null if it is not one this kind of network node sends.
     */
    protected abstract read(payload: unknown): P | null

    /** Puts out on the output what a copy listened to has shared. */
    protected abstract play(payload: P): void

    onMessage(message: unknown){
        if (typeof message !== "object" || message === null || !("payload" in message)) return
        const { payload, channel } = message as NetworkMessage
        if (typeof channel !== "number" || !this.listensTo(channel)) return
        const read = this.read(payload)
        if (read !== null) this.play(read)
    }

    private listensTo(channel: number){
        return this.enabled && (channel === ALL || this.receiveChannel === ALL || channel === this.receiveChannel)
    }

    async setState(){ }

    async getState(){ }

    getStateKeys(){ return [] }

    async dispose(){ }
}
