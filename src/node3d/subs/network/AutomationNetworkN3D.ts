import type { Node3DFactory } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import { AbstractNetworkN3D, NetworkN3DGUI } from "./AbstractNetworkN3D";

/** The value of the automation, between 0 and 1. */
type AutomationPayload = number


/**
 * A network node of automation: a parameter driven through it drives the parameters connected to its copies on every client.
 *
 * @remarks
 * The value travels normalized, so each output maps it onto the range of the parameter it drives.
 */
export class AutomationNetworkN3D extends AbstractNetworkN3D<AutomationPayload> {

    private output

    /** The last value shared, so a controller repeating it does not flood the network. */
    private last?: number

    constructor(context: Node3DContext, gui: NetworkN3DGUI){
        super(context, gui)
        const {tools:T} = context

        context.createConnectable(new T.AutomationN3DConnectable.Input(
            "automation_input",
            [gui.input],
            "Automation Input",
            {
                setValue: value => this.receive(value),
                getExponant: () => 1,
                getMin: () => 0,
                getMax: () => 1,
                getStepSize: () => 0,
                stringify: value => value.toPrecision(3),
                getLabel: () => "Automation Network",
                lock: () => { },
            },
        ))

        this.output = new T.AutomationN3DConnectable.Output(
            "automation_output",
            [gui.output],
            "Automation Output",
        )
        context.createConnectable(this.output)
    }

    private receive(value: number){
        if (value === this.last) return
        this.last = value
        this.share(value)
    }

    protected read(payload: unknown): AutomationPayload | null {
        return typeof payload === "number" && isFinite(payload) ? Math.min(1, Math.max(0, payload)) : null
    }

    protected play(value: AutomationPayload){
        this.output.normalizedValue = value
    }
}


export const AutomationNetworkN3DFactory: Node3DFactory<NetworkN3DGUI, AutomationNetworkN3D> = {

    label: "Automation Network",

    description: "Shares automation between the players: the value it receives drives the parameters connected to its output on the side of every player listening on its channel.",

    tags: ["automation", "network", "technical"],

    createGUI: async (context) => new NetworkN3DGUI(context, {
        name: "automation network",
        logoColor: new context.babylon.Color3(1, .6, .15),
        portColor: context.tools.AutomationN3DConnectable.Color,
    }),

    create: async (context, gui) => new AutomationNetworkN3D(context, gui),
}
