import { AbstractMesh, Color3 } from "@babylonjs/core";
import { Node3DConnectable } from "../../Node3DConnectable";

/**
 * Simple implementations of Node3DConnectable for the "sync" protocol.
 * « Abandonne tout espoir toi qui entre ici »
 */
export namespace SynxN3DConnectable {

    export const Color = Color3.FromHexString("#fff700")

    interface SyncMessage {
        id?: unknown
        sendEnd?: number
        sendTailTotal?: number
        sendTotal?: number
    }

    /**
     * Connection object for Sync protocol - allows Output to register with Input's Container
     */
    export interface SyncN3DConnection {
        inputContainer: Container
        registerCallback(callback: (msg: SyncMessage) => void): void
        unregisterCallback(callback: (msg: SyncMessage) => void): void
    }

    /**
     * A container that contains the sync informations
     */
    export class Container {

        constructor(duration: number) {
            this._duration = duration
            this._tail_total = duration
            this._total = duration
            this._start = 0
        }

        // Graph
        _next = new Map<unknown, (msg: SyncMessage) => void>()
        _previous = new Map<unknown, (msg: SyncMessage) => void>()

        get hasUp() { return this._next.size > 0 }

        get hasDown() { return this._previous.size > 0 }

        sendUp(msg: SyncMessage) {
            for (const sender of this._next.values()) {
                sender(msg)
            }
        }

        sendDown(msg: SyncMessage) {
            for (const sender of this._previous.values()) {
                sender(msg)
            }
        }

        // Calculate
        _start = 0
        _duration = 0
        _tail_total = 0
        _total = 0
        _ends = new Map<unknown, number>()
        _tails = new Map<unknown, number>()

        resendEnd() {
            const end = this._start + this._duration
            this.sendUp({ id: this, sendEnd: end })
        }

        resendTailTotal() {
            const tail_total = this._tail_total
            this.sendDown({ id: this, sendTailTotal: tail_total })
        }

        resendTotal() {
            this.sendUp({ id: this, sendTotal: this._total })
        }

        onMessage(msg: SyncMessage) {
            if (msg.sendEnd != undefined) {
                this._ends.set(msg.id, msg.sendEnd)
                const start = Math.max(...this._ends.values(), 0)
                if (start != this._start) {
                    this._start = start
                    if (this.hasUp) this.resendEnd()
                    else {
                        this._tail_total = start + this._duration
                        this.resendTailTotal()
                    }
                }
            }
            if (msg.sendTailTotal != undefined) {
                this._tails.set(msg.id, msg.sendTailTotal)
                const newTail = Math.max(...this._tails.values(), 0)
                if (newTail != this._tail_total) {
                    this._tail_total = newTail
                    if (this.hasDown) this.resendTailTotal()
                    else {
                        this._total = this._tail_total
                        this.resendTotal()
                    }
                }
            }
            if (msg.sendTotal != undefined) {
                if (msg.sendTotal != this._total) {
                    this._total = msg.sendTotal
                    this.resendTotal()
                }
            }
        }

        get start() { return this._start }

        get duration() { return this._duration }

        get total() { return this._total }

        set duration(value: number) {
            this._duration = value
            if (this.hasUp) this.resendEnd()
            else {
                this._tail_total = this._start + this._duration
                this.resendTailTotal()
            }
        }

    }

    /**
     * A input connectable for sync protocol
     */
    export class Input implements Node3DConnectable {

        private callbacks = new Set<(msg: SyncMessage) => void>()

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly container: Container,
        ) { }

        get type() { return "sync" }

        get color() { return SynxN3DConnectable.Color }

        connectAsInput(): SyncN3DConnection {
            const that = this
            return {
                inputContainer: this.container,
                registerCallback(callback: (msg: any) => void) {
                    that.container._previous.set(callback, callback)
                    that.callbacks.add(callback)
                },
                unregisterCallback(callback: (msg: any) => void) {
                    that.container._previous.delete(callback)
                    that.callbacks.delete(callback)
                }
            }
        }

        connectAsOutput(_: any): void { }

        disconnectAsInput(_: any): void { }

        disconnectAsOutput(_: any): void { }
    }

    /**
     * A output connectable for sync protocol
     */
    export class Output implements Node3DConnectable {

        private registeredConnection: SyncN3DConnection | null = null
        private callback: ((msg: SyncMessage) => void) | null = null

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly container: Container,
        ) { }

        get type() { return "sync" }

        get direction() { return "output" as "output" }

        get color() { return SynxN3DConnectable.Color }

        connectAsInput(): any { return {} }

        connectAsOutput(connection: SyncN3DConnection): void {
            // Disconnect from previous connection if any
            if (this.registeredConnection && this.callback) {
                this.registeredConnection.unregisterCallback(this.callback)
                this.container._next.delete(this.registeredConnection.inputContainer)
            }
            
            this.registeredConnection = connection
            
            const inputContainer = connection.inputContainer
            
            this.callback = (msg: SyncMessage) => inputContainer.onMessage(msg)
            
            // Register in the input's _previous (inputs register what sends to them)
            connection.registerCallback(this.callback)
            
            // Register in the output's _next (outputs register where they send to)
            this.container._next.set(inputContainer, this.callback)
            
            // Sync duration
            this.container.duration = inputContainer.duration
        }

        disconnectAsInput(_: any): void { }

        disconnectAsOutput(_: SyncN3DConnection): void {
            if (this.registeredConnection && this.callback) {
                // Unregister from input's _previous (where input listens to this output)
                this.registeredConnection.unregisterCallback(this.callback)
                
                // Unregister from output's _next (where output sends to)
                this.container._next.delete(this.registeredConnection.inputContainer)
                
                this.registeredConnection = null
                this.callback = null
            }
        }
    }
}
