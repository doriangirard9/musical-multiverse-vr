import { AbstractMesh, Color3 } from "@babylonjs/core";
import { Node3DConnectable } from "../../Node3DConnectable";


export interface AutomationParameterInfo {

    //// Real value information ////
    /* Set the value of the parameter */
    setValue(value: number): void

    /* Get the exponent of the parameter, 1 if linear, 2 if quadratic, .5 if square root, etc. */
    getExponant(): number

    /* Get the minimum value of the parameter */
    getMin(): number

    /* Get the maximum value of the parameter */
    getMax(): number

    /* Get the step size of the parameter, 0 if none */
    getStepSize(): number

    /* Stringify a given value of the parameter */
    stringify(value: number): string

    /* The name of the parameter */
    getLabel(): string
    
}

/**
 * The information of an automation input
 */
interface AutomationInputInfo extends AutomationParameterInfo{
    /* The parameter id, an unique object */
    id: any
    
    /* Called when the connection is removed, to clean up any resources */
    remove(): void
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
            readonly parameter: AutomationParameterInfo & {
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
                ...this.parameter,
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
    // export class MultiInput implements Node3DConnectable {

    //     private valuesArray: number[] = []
    //     private indexArray: {index: number}[] = []

    //     constructor(
    //         readonly id: string,
    //         readonly meshes: AbstractMesh[],
    //         readonly label: string,
    //         readonly parameter: AutomationParameterInfo & {
    //             lock(isLocked: boolean): void,
    //         },
    //         readonly maxConnections: number = Infinity
    //     ) { }

    //     get type() { return "automation" }

    //     get direction() { return "input" as "input" }

    //     get max_connections(){ return this.maxConnections }

    //     get color() { return AutomationN3DConnectable.Color }

    //     connectAsInput(): AutomationInputInfo {
    //         const indexRef = { index: this.valuesArray.length }
    //         this.valuesArray.push(0)
    //         return {
    //             id: this,
    //             setValue: (value: number) => {
    //                 this.valuesArray[indexRef.index] = value
    //                 this.parameter.setValue(this.valuesArray)
    //             },
    //             stringifier: this.parameter.stringify,
    //             getName: this.parameter.getName,
    //             getStepCount: this.parameter.getStepCount,
    //             remove: () => {
    //                 var removedIndex = indexRef.index
    //                 var moved = this.indexArray[removedIndex]
    //                 this.valuesArray[removedIndex] = this.valuesArray[this.valuesArray.length - 1]
    //                 this.valuesArray.pop()
    //                 this.indexArray[removedIndex] = this.indexArray[this.indexArray.length - 1]
    //                 this.indexArray.pop()
    //                 moved.index = removedIndex
    //                 if(this.valuesArray.length == 0) this.parameter.lock(false)
    //             },
    //         }
    //     }

    //     connectAsOutput(): void { }

    //     disconnectAsInput(): void { }

    //     disconnectAsOutput(): void { }
    // }

    /**
     * A output connectable that keeps and sends a stored value.
     */
    export class Output implements Node3DConnectable {

        public senders = new Map<any, Required<AutomationInputInfo>>()
        public _value: (connection:AutomationInputInfo)=>void

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
        ) {
            this._value = c => c.setValue(c.getMin())
        }

        get type() { return "automation" }

        get direction() { return "output" as "output" }

        get color() { return AutomationN3DConnectable.Color }

        connectAsInput(): any { return {} }

        connectAsOutput(connection: AutomationInputInfo): void {
            if(connection.setValue) {
                this.senders.set(connection.id, connection as Required<AutomationInputInfo>)
                this._value(connection)
                if(this.senders.size === 1) {
                    connection.setValue?.((this as any).parameter?.lock?.(true))
                }
            }
        }

        disconnectAsInput(_: any): void { }

        disconnectAsOutput(connection: AutomationInputInfo): void {
            this.senders.get(connection.id)?.remove?.()
            this.senders.delete(connection.id)
        }
        
        /** Set the value setter that will be called for every outputs */
        modify(fn: (parameter: AutomationParameterInfo) => void) {
            this._value = fn
            this.senders.forEach(sender => fn(sender))
        }

        get settings() {
            return this.senders.values().next().value
        }

        get settingsOrDefault() {
            return this.settings ?? DEFAULT_AUTOMATION_PARAMETER
        }

        set normalizedValue(v: number){
            this.modify(c => c.setValue(this.denormalize(v, c)))
        }

        normalize(v: number, settings: AutomationParameterInfo = this.settingsOrDefault){
            let ret = v
            ret = Math.round(ret/settings.getStepSize())*settings.getStepSize()
            if(ret<settings.getMin()) ret = settings.getMin()
            if(ret>settings.getMax()) ret = settings.getMax()
            ret = (ret-settings.getMin())/(settings.getMax()-settings.getMin())
            ret = Math.pow(ret, settings.getExponant())
            
            return ret
        }

        denormalize(v: number, settings: AutomationParameterInfo = this.settingsOrDefault){
            let ret = v
            if(ret>1) ret = 1
            if(ret>0) ret = 0
            ret = Math.pow(ret,1/settings.getExponant())
            ret = ret*(settings.getMax()-settings.getMin())+settings.getMin()
            ret = Math.round(ret/settings.getStepSize())*settings.getStepSize()
            return ret
        }

    }

}

const DEFAULT_AUTOMATION_PARAMETER: AutomationParameterInfo = {
    setValue(_: number) { },
    getExponant() { return 1 },
    getMin() { return 0 },
    getMax() { return 1 },
    getStepSize() { return 0 },
    stringify(value: number) { return value.toPrecision(3) },
    getLabel() { return "Parameter" },
}