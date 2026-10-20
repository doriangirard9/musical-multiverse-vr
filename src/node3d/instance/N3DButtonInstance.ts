import { Behavior, HighlightLayer, Observable, TransformNode, UtilityLayerRenderer } from "@babylonjs/core"
import { InputMultiGrabBehavior } from "../../xr/inputs/tools/InputMultiGrabBehavior"
import { InputMultiHoverBehavior } from "../../xr/inputs/tools/InputMultiHoverBehavior"
import { InputPressBehavior } from "../../xr/inputs/tools/InputPressBehavior"
import { PointerInput } from "../../xr/inputs/PointerInput"
import { InputManager } from "../../xr/inputs/InputManager"
import { N3DInteractions } from "./N3DInteractions"
import { Node3DButton } from "../Node3DButton"
import { NodeCompUtils } from "../tools/utils/NodeCompUtils"
import { N3DText } from "./utils/N3DText"
import type { Node3DInstance } from "./Node3DInstance"


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
        readonly node3d: Node3DInstance,
        root: TransformNode,
        highlightLayer: HighlightLayer,
        utilityLayer: UtilityLayerRenderer,
        readonly config: Node3DButton,
    ) {
        const {meshes} = config

        /* Parameter value text visual */
        // Gère l'affichage du texte de la valeur du paramètre
        const text = this.text = new N3DText(`button ${config.id}`, config.meshes, utilityLayer.utilityLayerScene)
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

        const on_pick_down = (pointers: PointerInput[])=>{
            config.press()
            this.onPressed.notifyObservers()
            this.onGrab.notifyObservers(pointers)
            visual.offset(1)
        }

        const on_pick_up = (pointers: PointerInput[])=>{
            config.release()
            this.onRelease.notifyObservers(pointers)
            visual.offset(-1)
        }

        const disposables: (()=>void)[] = []

        // The capability is asked per pointer: a hand whose tool did not ask for the buttons
        // passes over them without lighting nor pressing them, while the other hand still does.
        const buttons = N3DInteractions.buttons
        const inputs = InputManager.getInstance()

        for(const draggable of meshes){
            const hovering = new Set<PointerInput>()
            const hover = new InputMultiHoverBehavior(
                pointer=>{
                    if(!buttons.isEnabledFor(pointer)) return
                    hovering.add(pointer)
                    if(hovering.size===1) on_pointer_over()
                },
                pointer=>{
                    if(!hovering.delete(pointer)) return
                    if(hovering.size===0) on_pointer_out()
                },
                buttons,
            )
            draggable.addBehavior(hover)

            let behavior: Behavior<any>
            if(config.supportSwipe){
                // The press does not say which pointer presses: it is on as long as one allowed
                // pointer presses the button.
                let pressed = false
                let pressers: PointerInput[] = []
                const pressedByAllowed = () => inputs.controllers
                    .filter(c => c.pointer.targetMesh===draggable && c.trigger.isPressed() && buttons.isEnabledFor(c.pointer))
                    .map(c => c.pointer)
                const check = () => {
                    const pressing = pressedByAllowed()
                    const shouldBePressed = pressing.length>0
                    if(shouldBePressed && !pressed){
                        pressers = pressing
                        on_pick_down(pressers)
                    }
                    else if(!shouldBePressed && pressed){
                        on_pick_up(pressers)
                        pressers = []
                    }
                    pressed = shouldBePressed
                }
                behavior = new InputPressBehavior(check, check, buttons)
            }
            else{
                const pressing = new Set<PointerInput>()
                behavior = new InputMultiGrabBehavior(
                    pointer=>{
                        if(!buttons.isEnabledFor(pointer)) return
                        pressing.add(pointer)
                        if(pressing.size===1) on_pick_down([...pressing])
                    },
                    pointer=>{
                        if(!pressing.delete(pointer)) return
                        if(pressing.size===0) on_pick_up([pointer])
                    },
                    undefined,
                    buttons,
                )
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
    readonly onPressed = new Observable<void>()

    /** Notified when hands press the button, with the pointers pressing it. */
    readonly onGrab = new Observable<PointerInput[]>()

    /** Notified when the last hand pressing the button lets go, with the pointers that were pressing it. */
    readonly onRelease = new Observable<PointerInput[]>()

}
