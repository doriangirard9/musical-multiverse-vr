import { ActionManager, Color3, HighlightLayer, Matrix, TransformNode, UtilityLayerRenderer, Vector3 } from "@babylonjs/core"
import { NodeCompUtils } from "../tools/utils/NodeCompUtils"
import { Node3DParameter } from "../Node3DParameter"
import { N3DText } from "./utils/N3DText"
import { InputHoverBehavior } from "../../xr/inputs/tools/InputHoverBehavior"
import { InputGrabBehavior } from "../../xr/inputs/tools/InputGrabBehavior"
import { Node3DInstance } from "./Node3DInstance"

const highlightColor = Color3.Blue()


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
            const action = draggable.actionManager ??= new ActionManager(root.getScene())
        
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

            const drag = new InputGrabBehavior(
                input=>{
                    visual.offset(1)
                
                    const stepCount = config.getStepCount()
                    if(stepCount<=1){
                        stepSize = 0.001
                        changeFactor = 0.2
                    }
                    else{
                        stepSize = 1/(stepCount-1)
                        changeFactor = stepSize*4
                    }
                    startingValue = config.getValue() + stepSize/2

                    changeFactor*=2

                    // If stepCount is 2, the value is directly changed
                    if(stepSize==1){
                        this.setValue(config.getValue()<.5 ? 1 : 0)
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
                    if(stepSize==1)return

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
                    newvalue = Math.max(0, Math.min(1, newvalue))
                    this.setValue(newvalue)
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

    /**
     * Set value and sync if needed.
     * Don't works if the parameter is locked.
     * @param value 
     */
    setValue(value: number){
        if(this.isLocked) return
        this.config.setValue(value)
        if(!this.config.notSynced) this.node3d.set_state("node3d_parameter_"+this.config.id)
    }

    /**
     * Set value without syncing, used for automated changes (eg. when receiving state from other clients).
     * @param value 
     */
    setValueAutomated(value: number){
        this.config.setValue(value, true)
    }

    readonly dispose
    readonly text
    readonly highlight
    readonly visual

}