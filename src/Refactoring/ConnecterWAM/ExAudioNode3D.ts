
import {AbstractMesh} from "@babylonjs/core";
import {IWamConnectionStrategy} from "./interfaces/IWamConnectionStrategy.ts";

export interface Pedal3DNode {
    outputs : {
        Strategie: IWamConnectionStrategy // pour connect() et disconnect()
    }[]
    inputs : {
        Strategie: IWamConnectionStrategy // pour connect() et disconnect()
    }[]

    fields : Record<string,{
        name: string
        step: number // step de l'effet
        setValue(value: number): void
        getValue(): number // getParameterValue()
        stringify(value: number): string
    }>

    getState() : any
    getOneState(id: string) : any

    setState(state: any) : void
    setOneState(id: string, state : any) : void

    dispose(): void

}

interface Pedal3DSettings {
    B : typeof import("@babylonjs/core")
    onStateChange: (id : string) => void
}

export interface Pedal3DGUI {
    /**
     * Visuel de la base de la représentation 3D (draggable)
     * Parent de toute la GUI
     */
    pad : AbstractMesh;
    outputs: {
        visual : AbstractMesh // la boule rouge
        setConnected(connected: boolean): void
    }[]
    inputs:{
        visual : AbstractMesh // la boule bleu ou verte
        setConnected(connected: boolean): void
    }[]
    fields: Record<string,{
        visual : AbstractMesh // cylindre ou mesh pour l'effet visual[0] == fields[0]
    }>
    dispose(): void
}

export interface Pedal3D{
    createNode(settings: Pedal3DSettings): Pedal3DNode
    createGui(node?: Pedal3DNode): Pedal3DNode
}

/**
 *     private ports = new Map<string, IWamPort>();
 *
 *     public initializePorts(): void {
 *         if (this.descriptor.hasAudioInput) {
 *             this.addPort(new AudioInputPort('audioIn', this.audioNode));
 *         }
 *
 *         if (this.descriptor.hasAudioOutput) {
 *             this.addPort(new AudioOutputPort('audioOut', this.audioNode));
 *         }
 *
 *         if (this.descriptor.hasMidiInput) {
 *             this.addPort(new MidiInputPort('midiIn', this.audioNode));
 *         }
 *
 *         if (this.descriptor.hasMidiOutput) {
 *             this.addPort(new MidiOutputPort('midiOut', this.audioNode));
 *         }
 *     }
 *
 *     private addPort(port: IWamPort) : void {
 *         this.ports.set(port.id, port);
 *     }
 *     public getPort(id: string): IWamPort | undefined {
 *         return this.ports.get(id);
 *     }
 *     public hasPort(id: string): boolean {
 *         return this.ports.has(id);
 *     }
 *
 *     interface Pedal{
 *         createNode(): PedalNode
 *         createGui(node: PedalNode?): PedalGui
 *     }
 */