import { AbstractMesh, ActionManager, Axis, Color3, ExecuteCodeAction, HighlightLayer, MeshBuilder, PickingInfo, SixDofDragBehavior, Space, TransformNode, Vector3 } from "@babylonjs/core"
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui"
import { NodeCompUtils } from "../tools/utils/NodeCompUtils"

const highlightColor = Color3.Blue()



/**
 * A simple parameter whose value is changed by dragging it.
 */
export class N3DParameterInstance {

    /**
     * 
     * @param root The root node of the audio node, the parent node of the parameter node.
     * @param draggable The draggable mesh of the parameter, which is highlighted and draggable.
     * @param highlightLayer The highlight layer used to highlight the parameter.
     * @param getName A function that returns the name of the parameter.
     * @param getValue A function that returns the value of the parameter. (between 0 and 1)
     * @param setValue A function that sets the value of the parameter. (between 0 and 1)
     * @param getStepSize A function that returns the step size of the parameter. (between 0 and 1)
     * @param stringify A function that returns the string representation of the parameter value.
     */
    constructor(
        root: TransformNode,
        draggables: AbstractMesh[],
        highlightLayer: HighlightLayer,
        getName: () => string,
        getValue: () => number,
        setValue: (value: number) => void,
        getStepCount: () => number,
        stringify: (value: number) => string,
    ) {

        /* Parameter value text visual */
        // Gère l'affichage du texte de la valeur du paramètre
        const text = this.text = (()=>{
            const valuePlane = MeshBuilder.CreatePlane('textPlane', { size: 1, width: 5 }, root.getScene())
            valuePlane.parent = root
            valuePlane.rotate(Axis.X, 0, Space.WORLD)
            valuePlane.setEnabled(false)

            const valueTex = AdvancedDynamicTexture.CreateForMesh(valuePlane, 1024, Math.floor(1024/5))
            const valueBlock = new TextBlock()
            valueBlock.fontSize = 50
            valueBlock.color = 'white'
            valueBlock.outlineColor = 'black'
            valueBlock.outlineWidth = 5
            valueTex.addControl(valueBlock)

            return {
                set(value: string){ valueBlock.text = value },
                show(){ valuePlane.setEnabled(true) },
                hide(){ valuePlane.setEnabled(false) },
                dispose(){
                    valuePlane.dispose()
                    valueTex.dispose()
                    valueBlock.dispose()
                },
                setPosition(absolute: Vector3){
                    valuePlane.setAbsolutePosition(absolute)
                }
            }
        })()
        /* */


        /* Highlight visual */
        // Gère l'affichage de la surbrillance du paramètre
        const highlight = this.highlight = {
            show(){ for(const d of draggables) NodeCompUtils.highlight(highlightLayer, d, highlightColor) },
            hide(){ for(const d of draggables) NodeCompUtils.unhighlight(highlightLayer, d) },
            dispose(){ for(const d of draggables) NodeCompUtils.unhighlight(highlightLayer, d) },
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
            const position = draggables[0].getAbsolutePosition().clone()
            position.y += draggables[0].getBoundingInfo().boundingBox.extendSize.y*2
            text.setPosition(position)
            text.set(getName() + "\n" + stringify(getValue()))
        }
        /* */

        const disposables: (()=>void)[] = []

        for(const draggable of draggables){
            const action = draggable.actionManager ??= new ActionManager(root.getScene())
        
            const _onover = action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
                updateText()
                visual.offset(1)
            }))!!

            const _onout = action.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
                visual.offset(-1)
            }))!!

            const drag = new SixDofDragBehavior()
            drag.allowMultiPointer = false
            drag.disableMovement = true
            drag.rotateWithMotionController = false
            drag.rotateDraggedObject = false
            draggable.addBehavior(drag)

    
            let startingValue = 0
            let stepSize = 0.01
            let changeFactor = 0

            // Get the stepCount / change factor / etc...
            drag.onDragStartObservable.add(() => {
                visual.offset(1)
                
                startingValue = getValue()
                const stepCount = getStepCount()
                if(stepCount==0){
                    stepSize = 0.001
                    changeFactor = 0.2
                }
                else{
                    stepSize = 1/stepCount
                    changeFactor = stepSize*4
                }

                // If stepCount is 1, the value is directly changed
                if(stepCount==2)setValue(getValue()<.5 ? 1 : 0)
            })

            drag.onDragEndObservable.add(() => visual.offset(-1))

            drag.onDragObservable.add((event: {delta: Vector3, position: Vector3, pickInfo: PickingInfo}): void => {
                let newvalue = (startingValue + event.delta.y * changeFactor)
                newvalue = newvalue - newvalue % stepSize
                newvalue = Math.max(0, Math.min(1, newvalue))
                setValue(newvalue)
                draggable.rotationQuaternion = null
                updateText()
            })

            disposables.push(() => {
                action.unregisterAction(_onover)
                action.unregisterAction(_onout)
                draggable.removeBehavior(drag)
            })
        }

        this.dispose = () => {
            disposables.forEach(d => d())
            text.dispose()
            highlight.dispose()
        }
    }

    readonly dispose
    readonly text
    readonly highlight
    readonly visual

}