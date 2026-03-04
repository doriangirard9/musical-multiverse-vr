import { AbstractMesh, Color3 } from "@babylonjs/core";
import { Node3DConnectable } from "../../Node3DConnectable";

/**
 * Simple implementations of Node3DConnectable for the "sync" protocol.
 * « Abandonne tout espoir toi qui entre ici »
 */
export namespace SynxN3DConnectable{

    export const InputColor = Color3.FromHexString("#fff700")

    export const OutputColor = Color3.FromHexString("#ffae00")

    /**
     * A containet that contains the sync informations
     */
    export class Container{

        constructor(duration: number){
            this._duration = duration
            this._tail_total = 0
            this._total = duration
            this._start = 0
        }

        // Graph
        _next = new Map<any, (msg:any)=>void>()
        _previous = new Map<any, (msg:any)=>void>()

        sendUp(msg: any){
            for(const sender of this._next.keys()){
                sender(msg)
            }
        }

        sendDown(msg: any){
            for(const sender of this._previous.keys()){
                sender(msg)
            }
        }

        // Calculate
        _start = 0
        _duration = 0
        _tail_total = 0
        _total = 0
        _ends = new Map<any, number>()
        _tails = new Map<any, number>()

        resendEnd(){
            const end = this._start + this._duration
            this.sendUp({id:this, sendEnd: end})
        }

        resendTailTotal(){
            const tail_total = this._duration - this._tail_total
            this.sendDown({id:this, sendTailTotal: tail_total})
        }

        resendTotal(){
            this.sendUp({id:this, sendTotal: this._total})
        }

        onMessage(msg:any){
            if(msg.sendEnd!=undefined){
                this._ends.set(msg.id, msg.sendEnd)
                const start = Math.max(...this._ends.values())
                if(start!=this._start){
                    this._start = start
                    this.resendEnd()
                }
            }
            if(msg.sendTailTotal!=undefined){
                this._tails.set(msg.id, msg.sendTailTotal)
                const newTail = Math.max(...this._tails.values())
                if(newTail!=this._tail_total){
                    this._tail_total = newTail
                    this.resendTailTotal()
                }
            }
            if(msg.sendTotal!=undefined){
                if(msg.sendTotal!=this._total){
                    this._total = msg.sendTotal
                    this.resendTotal()
                }
            }
        }

        get start(){ return this._start }

        get duration(){ return this._duration }

        get total(){ return this._total }

        set duration(value: number){
            this._duration = value
            this.resendEnd()
        }

    }

    /**
     * A input connectable that 
     */
    export class Input implements Node3DConnectable {

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly container: Container,
        ){}

        get type(){ return "sync" }

        get direction(){ return "input" as "input" }

        get color(){ return SynxN3DConnectable.InputColor }

        connect(sender: (value: any) => void): void {
            sender({ id: this, container: this.container, connect:true })
        }

        disconnect(sender: (value: any) => void): void {
            sender({ id: this, container: this.container })
        }

        receive(msg: any): void {
            const container = msg.container as Container
            if(msg.connect){
                this.container._next.set(container, msg=>container.onMessage(msg))
            }
            else{

            }
        }
    }
    

    /**
     * A input connectable that 
     */
    export class Output implements Node3DConnectable {

        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly container: Container,
        ){}

        get type(){ return "sync" }

        get direction(){ return "output" as "output" }

        get color(){ return SynxN3DConnectable.OutputColor }

        connect(sender: (value: any) => void): void {
            sender({
                id: this,
                sendTotal: (total:number) =>{
                    this.container._totalValues.set(sender, total)
                    this.container.updateTotal()
                }
            })
        }

        disconnect(sender: (value: any) => void): void {
            sender({
                id: this
            })
            this.container._totalValues.delete(sender)
            this.container.updateTotal()
        }

        receive(msg: any): void {
            if(msg.sendEnd) this.container._sendEnd.set(msg.id, msg.sendEnd)
            else this.container._sendEnd.delete(msg.id)
            this.container.updateEnd()
        }
    }
}
