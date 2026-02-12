import { AbstractMesh, Color3 } from "@babylonjs/core";
import { Node3DConnectable } from "../../Node3DConnectable";


interface AutomationConnectionMessage {
    id: any
    sender?(value: number): void
    stringifier?(value: number): string
    getStepCount?(): number
    getName?(): string
}

/**
 * Simple implementations of Node3DConnectable for the "automation" protocol.
 * 
 * Protocol:
 *  on connect, input send to the output : {
 *    id: any
 *    sender: (value:number)=>void
 *    stringifier: (value:number)=>string
 *  }
 * 
 * on disconnect, input send to the output : {
 *    id: any
 * }
 * 
 * the output can call sender(value) to send a value to the input.
 */
export class AutomationN3DConnectable {

    private constructor() { }

    static InputColor = Color3.FromHexString("#515252")

    static OutputColor = Color3.FromHexString("#bfbebe")

    /**
     * A input connectable that connect an WamNode.
     */
    static Input = class Input implements Node3DConnectable {

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            private parameter: {
                setValue(value: number): void,
                stringify(value: number): string,
                getStepCount(): number,
                getName(): string,
                lock(isLocked: boolean): void,
            },
        ) { }

        get type() { return "automation" }

        get direction() { return "input" as "input" }

        get max_connections(){ return 1}

        get color() { return AutomationN3DConnectable.InputColor }

        connect(sender: (value: AutomationConnectionMessage) => void): void {
            sender({
                id: this.id,
                sender: this.parameter.setValue,
                stringifier: this.parameter.stringify,
                getName: this.parameter.getName,
                getStepCount: this.parameter.getStepCount,
            })
            this.parameter.lock(true)
        }

        disconnect(sender: (value: any) => void): void {
            sender({
                id: this.id,
            })
            this.parameter.lock(false)
        }

        receive(_: any): void { }
    }

    /**
     * A output connectable that keep and send a stored value.
     */
    static Output = class Output implements Node3DConnectable {

        public senders = new Map<any, Required<AutomationConnectionMessage>>()

        public _value: number = 0

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            defaultValue: number,
        ) {
            this._value = defaultValue
        }

        get type() { return "automation" }

        get direction() { return "output" as "output" }

        get color() { return AutomationN3DConnectable.OutputColor }

        connect(_: (value: any) => void): void { }

        disconnect(_: (value: any) => void): void { }

        set value(v: number) {
            this._value = v
            this.senders.forEach(sender => sender.sender!!(v))
        }

        get value() {
            return this._value
        }

        get settings() {
            return this.senders.values().next().value
        }

        stringify(value: number) {
            return this.settings?.stringifier?.(value) ?? value.toPrecision(3)
        }

        get stepCount() {
            return this.settings?.getStepCount?.() ?? 0
        }

        get name() {
            return this.settings?.getName?.() ?? "Parameter"
        }

        receive(msg: AutomationConnectionMessage): void {
            if (msg.sender) {
                this.senders.set(msg.id, msg as Required<AutomationConnectionMessage>)
                msg.sender(this._value)
            }
            else {
                this.senders.delete(msg.id)
            }
        }
    }

}