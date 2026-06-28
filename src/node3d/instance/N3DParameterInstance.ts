import { Color3, HighlightLayer, Matrix, Observable, TransformNode, UtilityLayerRenderer, Vector3 } from "@babylonjs/core"
import { NodeCompUtils } from "../tools/utils/NodeCompUtils"
import { Node3DParameter } from "../Node3DParameter"
import { N3DText } from "./utils/N3DText"
import { InputHoverBehavior } from "../../xr/inputs/tools/InputHoverBehavior"
import { InputGrabBehavior } from "../../xr/inputs/tools/InputGrabBehavior"
import { Node3DInstance } from "./Node3DInstance"

const highlightColor = Color3.Blue()

export enum ParameterChangeMode{
    /** The parameter value is changed by automation, such as a sequencer or an LFO. */
    AUTOMATION,
    /** The parameter value is changed by direct user interaction (by dragging the parameter), such as dragging the parameter. */
    DIRECT_MANUAL,
    /** The parameter value is changed by user interaction. */
    MANUAL,
}


/**
 * A simple parameter whose value is changed by dragging it.
 */
export class N3DParameterInstance {

    /**
     * Is the parameter locked.
     * When locked, the value cannot be changed by user interaction.
     */
    isLocked = false

    /**
     * 
     * @param root The root node of the audio node, the parent node of the parameter node.
     * @param draggable The draggable mesh of the parameter, which is highlighted and draggable.
     * @param highlightLayer The highlight layer used to highlight the parameter.
     * @param getLabel A function that returns the name of the parameter.
     * @param getValue A function that returns the value of the parameter. (between 0 and 1)
     * @param setValue A function that sets the value of the parameter. (between 0 and 1)
     * @param getStepSize A function that returns the step size of the parameter. (between 0 and 1)
     * @param stringify A function that returns the string representation of the parameter value.
     */
    constructor(
        readonly node3d: Node3DInstance,
        root: TransformNode,
        highlightLayer: HighlightLayer,
        utilityLayer: UtilityLayerRenderer,
        readonly config: Node3DParameter,
    ) {

        /* Parameter value text visual */
        // Gère l'affichage du texte de la valeur du paramètre
        const text = this.text = new N3DText(`parameter ${config.id}`, config.meshes, utilityLayer.utilityLayerScene)
        /* */


        /* Highlight visual */
        // Gère l'affichage de la surbrillance du paramètre
        const highlight = this.highlight = {
            show(){ for(const d of config.meshes) NodeCompUtils.highlight(highlightLayer, d, highlightColor) },
            hide(){ for(const d of config.meshes) NodeCompUtils.unhighlight(highlightLayer, d) },
            dispose(){ for(const d of config.meshes) NodeCompUtils.unhighlight(highlightLayer, d) },
        } 
        /* */


        /* Mix visuals */
        const visual = this.visual = {
            stack: 0,
            offset(offset: number){
                this.stack += offset
                if(this.stack == 1){
                    highlight.show()
                    text.show()
                }
                else if(this.stack == 0){
                    highlight.hide()
                    text.hide()
                }
            }
        } 
        /* */


        /* Shared functions */
        function updateText(){
            text.updatePosition()
            text.set([
                {content: config.getLabel()},
                {content: config.stringify(config.getValue()), size: .7}
            ])
        }
        /* */

        const disposables: (()=>void)[] = []

        for(const draggable of config.meshes){        
            const hover = new InputHoverBehavior(()=>{
                updateText()
                visual.offset(1)
            }, ()=>{
                visual.offset(-1)
            })
    
            let startingValue = 0
            let stepSize = 0.01
            let changeFactor = 0
            let grabY = 0   // world-space controller Y captured at grab start

            const reverseMatrix = Matrix.Identity()
            const relativePosition = new Vector3()
            const relativeDirection = new Vector3()
            const temp = new Vector3()

            const isButton = ()=>{
                return stepSize>=(this.getMax()-this.getMin())
            }

            const drag = new InputGrabBehavior(
                input=>{
                    visual.offset(1)
                
                    stepSize = config.getStepSize()
                    if(stepSize<=0){
                        stepSize = 0.001*(this.getMax()-this.getMin())
                        changeFactor = 0.2*(this.getMax()-this.getMin())
                    }
                    else{
                        changeFactor = stepSize*4
                    }
                    startingValue = config.getValue() + stepSize/2

                    changeFactor*=2

                    // If stepCount is 2, the value is directly changed
                    if(isButton()){
                        this.setValue(config.getValue()<(this.getMax()+this.getMin())/2 ? this.getMax() : this.getMin())
                        updateText()
                    }
                    
                    reverseMatrix.copyFrom(input.matrix).invertToRef(reverseMatrix)
                    grabY = input.origin.y
                },
                ()=>{
                    visual.offset(-1)
                },
                input=>{
                    // If stepCount is 2, do nothing on drag
                    if(isButton())return

                    // Get ray relative to the parameter
                    Vector3.TransformCoordinatesToRef(input.origin, reverseMatrix, relativePosition)
                    Vector3.TransformNormalToRef(input.forward, reverseMatrix, relativeDirection)
                    
                    const fromOffset = config.fromOffset ?? ((posOffset, dirOffset) => {
                        // Project to ground plane
                        const ground_length = Math.abs(Math.pow(dirOffset.x,2) + Math.pow(dirOffset.z,2))
                        const corrected_length = Math.min(1/ground_length,10)

                        temp.copyFrom(dirOffset).scaleInPlace(corrected_length).addInPlace(posOffset)
                        return -temp.y
                    })

                    const offset = fromOffset(relativePosition, relativeDirection)

                    let newvalue = (startingValue + offset * changeFactor)
                    newvalue = newvalue - newvalue % stepSize
                    newvalue = Math.max(this.getMin(), Math.min(this.getMax(), newvalue))
                    this.setValue(newvalue, ParameterChangeMode.DIRECT_MANUAL)
                    draggable.rotationQuaternion = null
                    updateText()
                },
            )
            
            draggable.addBehavior(hover)
            draggable.addBehavior(drag)


            disposables.push(() => {
                draggable.removeBehavior(hover)
                draggable.removeBehavior(drag)
            })
        }

        this.dispose = () => {
            disposables.forEach(d => d())
            text.dispose()
            highlight.dispose()
        }
    }

    //// Real value ////
    /** Set the value of the parameter. */
    setValue(value: number, type: ParameterChangeMode = ParameterChangeMode.DIRECT_MANUAL){
        // Filter
        let v = value
        if(v<this.config.getMin()) v = this.config.getMin()
        if(v>this.config.getMax()) v = this.config.getMax()
        if(this.config.getStepSize()>0) v = Math.round(v/this.config.getStepSize())*this.config.getStepSize()
        
        // Set the value
        if(type==ParameterChangeMode.DIRECT_MANUAL || type==ParameterChangeMode.MANUAL){
            if(this.isLocked && type==ParameterChangeMode.DIRECT_MANUAL) return
            this.config.setValue(v)
            this.onValueChanged.notifyObservers(v)
            this.node3d.onParameterChanged.notifyObservers({ id: this.config.id, value: v })
            if(!this.config.notSynced) this.node3d.set_state("node3d_parameter_"+this.config.id)
        }
        else if(type==ParameterChangeMode.AUTOMATION) this.config.setValue(value, true)
    }

    /** Get the current value of the parameter. */
    getValue(): number{
        return this.config.getValue()
    }

    /** Get the maximum value of the parameter. */
    getMax(): number{
        return this.config.getMax()
    }

    /** Get the minimum value of the parameter. */
    getMin(): number{
        return this.config.getMin()
    }

    /** Get the step size of the parameter. */
    getStepSize(): number{
        return this.config.getStepSize()
    }

    /** Get the exponent of the parameter. */
    getExponant(): number{
        return this.config.getExponant()
    }

    //// Normalized value ////
    /** Set the normalized value of the parameter. */
    setNormalizedValue(value: number, type: ParameterChangeMode = ParameterChangeMode.DIRECT_MANUAL){
        let n = value
        if(n<0) n = 0
        if(n>1) n = 1
        n = Math.pow(n, 1/this.getExponant())
        const v = this.getMin() + n * (this.getMax() - this.getMin())
        this.setValue(v,type)
    }

    /** Get the normalized value of the parameter. */
    getNormalizedValue(): number{
        const v = this.getValue()
        const n = (v - this.getMin()) / (this.getMax() - this.getMin())
        return Math.pow(n, this.getExponant())
    }

    /** Get the normalized step size of the parameter. */
    getNormalizedStepSize(): number{
        const stepSize = this.getStepSize()
        if(stepSize<=0) return 0
        return stepSize / (this.getMax() - this.getMin())
    }

    readonly dispose
    readonly text
    readonly highlight
    readonly visual
    readonly onValueChanged = new Observable<number>()

}
