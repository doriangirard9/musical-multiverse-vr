import { AbstractMesh, Color3 } from "@babylonjs/core";
import { Node3DConnectable } from "../../Node3DConnectable";

interface AutomationInputInfo {
    id: any
    sender?(value: number): void
    stringifier?(value: number): string
    getStepCount?(): number
    getName?(): string
    remove?(): void
}

/**
 * Simple implementations of Node3DConnectable for the "automation" protocol.
 */
export namespace AutomationN3DConnectable {
    export const Color = Color3.FromHexString("#515252")

    /**
     * A input connectable that receives automation values.
     */
    export class Input implements Node3DConnectable {

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly parameter: {
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

        get color() { return AutomationN3DConnectable.Color }

        connectAsInput(): AutomationInputInfo {
            this.parameter.lock(true)
            return {
                id: this,
                sender: this.parameter.setValue,
                stringifier: this.parameter.stringify,
                getName: this.parameter.getName,
                getStepCount: this.parameter.getStepCount,
                remove: () => { },
            }
        }

        connectAsOutput(): void { }

        disconnectAsInput(): void {
            this.parameter.lock(false)
        }

        disconnectAsOutput(): void { }
    }

    /**
     * A multi-input connectable that can receive multiple automation connections.
     * Values from multiple sources are passed as an array to the parameter.
     */
    export class MultiInput implements Node3DConnectable {

        private valuesArray: number[] = []
        private indexArray: {index: number}[] = []

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly parameter: {
                setValue(values: number[]): void,
                stringify(value: number): string,
                getStepCount(): number,
                getName(): string,
                lock(isLocked: boolean): void,
            },
            readonly maxConnections: number = Infinity
        ) { }

        get type() { return "automation" }

        get direction() { return "input" as "input" }

        get max_connections(){ return this.maxConnections }

        get color() { return AutomationN3DConnectable.Color }

        connectAsInput(): AutomationInputInfo {
            const indexRef = { index: this.valuesArray.length }
            this.valuesArray.push(0)
            return {
                id: this,
                sender: (value: number) => {
                    this.valuesArray[indexRef.index] = value
                    this.parameter.setValue(this.valuesArray)
                },
                stringifier: this.parameter.stringify,
                getName: this.parameter.getName,
                getStepCount: this.parameter.getStepCount,
                remove: () => {
                    var removedIndex = indexRef.index
                    var moved = this.indexArray[removedIndex]
                    this.valuesArray[removedIndex] = this.valuesArray[this.valuesArray.length - 1]
                    this.valuesArray.pop()
                    this.indexArray[removedIndex] = this.indexArray[this.indexArray.length - 1]
                    this.indexArray.pop()
                    moved.index = removedIndex
                    if(this.valuesArray.length == 0) this.parameter.lock(false)
                },
            }
        }

        connectAsOutput(): void { }

        disconnectAsInput(): void { }

        disconnectAsOutput(): void { }
    }

    /**
     * A output connectable that keeps and sends a stored value.
     */
    export class Output implements Node3DConnectable {

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

        get color() { return AutomationN3DConnectable.Color }

        connectAsInput(): any { return {} }

        connectAsOutput(connection: AutomationInputInfo): void {
            if(connection.sender) {
                this.senders.set(connection.id, connection as Required<AutomationInputInfo>)
                connection.sender(this._value)
                if(this.senders.size === 1) {
                    connection.sender?.((this as any).parameter?.lock?.(true))
                }
            }
        }

        disconnectAsInput(_: any): void { }

        disconnectAsOutput(connection: AutomationInputInfo): void {
            this.senders.get(connection.id)?.remove?.()
            this.senders.delete(connection.id)
        }

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
    }

}