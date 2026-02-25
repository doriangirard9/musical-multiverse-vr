import { AbstractMesh, Color3 } from "@babylonjs/core";
import { Node3DConnectable } from "../../Node3DConnectable";


interface AutomationInputInfo {
    id: any
    sender?(value: number): void
    stringifier?(value: number): string
    getStepCount?(): number
    getName?(): string
    remove?():void
}

/**
 * Simple implementations of Node3DConnectable for the "automation" protocol.
 * 
 * Protocol:
 *  on connect, input send to the output : AutomationConnectionMessage
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

        connect(sender: (value: AutomationInputInfo) => void): void {
            sender({
                id: this,
                sender: this.parameter.setValue,
                stringifier: this.parameter.stringify,
                getName: this.parameter.getName,
                getStepCount: this.parameter.getStepCount,
                remove() { },
            })
            this.parameter.lock(true)
        }

        disconnect(sender: (value: any) => void): void {
            sender({ id: this })
            this.parameter.lock(false)
        }

        receive(_: any): void { }
    }

    /**
     * A multi-input connectable that can receive multiple automation connections.
     * Values from multiple sources are passed as an array to the parameter.
     * Optimized for audio-rate automation with direct array access via mutable index refs.
     */
    static MultiInput = class MultiInput implements Node3DConnectable {

        private valuesArray: number[] = []
        private indexArray: {index: number}[] = []

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            private parameter: {
                setValue(values: number[]): void,
                stringify(value: number): string,
                getStepCount(): number,
                getName(): string,
                lock(isLocked: boolean): void,
            },
            private maxConnections: number = Infinity
        ) { }

        get type() { return "automation" }

        get direction() { return "input" as "input" }

        get max_connections(){ return this.maxConnections }

        get color() { return AutomationN3DConnectable.InputColor }

        connect(sender: (value: AutomationInputInfo) => void): void {
            const indexRef = { index: this.valuesArray.length }
            this.valuesArray.push(0)
            sender({
                id: this,
                sender: (value: number) => {
                    this.valuesArray[indexRef.index] = value
                    this.parameter.setValue(this.valuesArray)
                },
                stringifier: this.parameter.stringify,
                getName: this.parameter.getName,
                getStepCount: this.parameter.getStepCount,
                remove: ()=>{
                    var removedIndex = indexRef.index
                    var moved = this.indexArray[removedIndex]
                    this.valuesArray[removedIndex] = this.valuesArray[this.valuesArray.length - 1]
                    this.valuesArray.pop()
                    this.indexArray[removedIndex] = this.indexArray[this.indexArray.length - 1]
                    this.indexArray.pop()
                    moved.index = removedIndex
                    if(this.valuesArray.length==0)this.parameter.lock(false)
                },
            })
            if(this.valuesArray.length==1)this.parameter.lock(true)
        }

        disconnect(sender: (value: AutomationInputInfo) => void): void {
            sender({ id: this })
        }

        receive(_: any): void { }
    }

    /**
     * A output connectable that keep and send a stored value.
     */
    static Output = class Output implements Node3DConnectable {

        public senders = new Map<any, Required<AutomationInputInfo>>()

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

        receive(msg: AutomationInputInfo): void {
            if (msg.sender) {
                this.senders.set(msg.id, msg as Required<AutomationInputInfo>)
                msg.sender(this._value)
            }
            else {
                this.senders.get(msg.id)?.remove()
                this.senders.delete(msg.id)
            }
        }
    }

}