import { ActionManager, Behavior, ExecuteCodeAction, HighlightLayer, TransformNode } from "@babylonjs/core"
import { Node3DButton } from "../Node3DButton"
import { NodeCompUtils } from "../tools/utils/NodeCompUtils"
import { N3DText } from "./utils/N3DText"
import { InputHoverBehavior } from "../../xr/inputs/tools/InputHoverBehavior"
import { InputGrabBehavior } from "../../xr/inputs/tools/InputGrabBehavior"
import { InputMultiPressBehavior } from "../../xr/inputs/tools/InputMultiPressBehavior"


/**
 * A simple parameter whose value is changed by dragging it.
 */
export class N3DButtonInstance {

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
        root: TransformNode,
        highlightLayer: HighlightLayer,
        readonly config: Node3DButton,
    ) {
        const {meshes} = config

        /* Parameter value text visual */
        // Gère l'affichage du texte de la valeur du paramètre
        const text = this.text = new N3DText(`button ${config.id}`, config.meshes)
        /* */


        /* Highlight visual */
        // Gère l'affichage de la surbrillance du paramètre
        const highlight = this.highlight = {
            show(){ for(const d of meshes) NodeCompUtils.highlight(highlightLayer, d, config.color) },
            hide(){ for(const d of meshes) NodeCompUtils.unhighlight(highlightLayer, d) },
            dispose(){ for(const d of meshes) NodeCompUtils.unhighlight(highlightLayer, d) },
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
            text.set(config.label)
        }
        /* */

        const on_pointer_over = ()=>{
            updateText()
            visual.offset(1)
        }

        const on_pointer_out = ()=>{
            visual.offset(-1)
        }

        const on_pick_down = ()=>{
            config.press()
            visual.offset(1)
        }

        const on_pick_up = ()=>{
            config.release()
            visual.offset(-1)
        }

        const disposables: (()=>void)[] = []

        for(const draggable of meshes){
            const hover = new InputHoverBehavior(on_pointer_over, on_pointer_out)
            draggable.addBehavior(hover)

            let behavior: Behavior<any>
            if(config.supportSwipe){
                behavior = new InputMultiPressBehavior(on_pick_down, on_pick_up)
            }
            else{
                behavior = new InputGrabBehavior(on_pick_down, on_pick_up)
            }
            draggable.addBehavior(behavior)

            disposables.push(() => {
                draggable.removeBehavior(hover)
                draggable.removeBehavior(behavior)
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