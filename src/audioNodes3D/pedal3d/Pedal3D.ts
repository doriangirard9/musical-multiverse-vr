import { TransformNode, Vector3 } from "@babylonjs/core"
import { WamNode } from "@webaudiomodules/api"

/**
 * A audio input or output of a pedal.
 */
export interface Pedal3DConnectable{
    /**
     * The visual representation of the audio input or output.
     * It is draggable and connectable. 
     **/
    mesh: TransformNode

    /**
     * The audio node of the input or output.
     */
    audioNode: AudioNode|WamNode
}

/**
 * An input of a pedal.
 */
export interface Pedal3DInput{
    /** The visual representation of the audio input. **/
    mesh: TransformNode

    /** Get the value of the input. Normalized between 0 and 1. **/
    getValue(): number

    /** Set the value of the input. Normalized between 0 and 1. **/
    setValue(value: number): void

    /** Get the textual representation of the value. **/
    stringify(value: number): string
}

/**
 * A 3D object draggable, connectable, interactable in the 3D space.
 * It can be a pedal, an instrument, etc...
 */
export interface Pedal3D{

    /**
     * The inputs of the pedal.
     */
    readonly inputs: Pedal3DConnectable[]

    /**
     * The outputs of the pedal.
     */
    readonly outputs: Pedal3DConnectable[]

    /**
     * The parameters of the pedal.
     */
    readonly parameters: Pedal3DInput[]

    /**
     * The root node of the pedal.
     */
    readonly mesh: TransformNode

    /**
     * The bounds of the pedal base.
     */
    readonly bounds: Vector3

}