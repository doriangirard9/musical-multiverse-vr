import { Scene } from "@babylonjs/core"
import { Button, Control, ScrollViewer, StackPanel, TextBlock, Rectangle } from "@babylonjs/gui"
import { AbstractMenu } from "./AbstractMenu"

export interface MenuButton{
    label: string
    color?: string
    click?: () => void,
}

/**
 * A simple menu panel that show text buttons in front of the users.
 */
export class ChoiceMenu extends AbstractMenu {

    buttons: StackPanel
    declare scrollViewer: ScrollViewer

    constructor(
        scene: Scene,
        renderScene: Scene,
        buttonsInfo?: MenuButton[],
        private menuOptions?: { showCloseBar?: boolean, dragToScroll?: boolean }
    ) {
        super(scene, renderScene)
        
        this.initPanel("choice_menu", 1.2, 1.5, 256)
        this.buttons = new StackPanel()
        this.scrollViewer = new ScrollViewer()
        const scroll = this.scrollViewer
        const buttons = this.buttons

        const that = this

        const showCloseBar = this.menuOptions?.showCloseBar === true;
        
        if (showCloseBar) {
            const topBar = new Rectangle()
            topBar.height = "40px"
            topBar.thickness = 0
            topBar.background = "rgb(0,0,0,0.8)"
            
            const closeBtn = Button.CreateSimpleButton("closeBtn", "❌")
            closeBtn.width = "40px"
            closeBtn.height = "40px"
            closeBtn.color = "white"
            closeBtn.background = "transparent"
            closeBtn.thickness = 0
            closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT
            closeBtn.onPointerUpObservable.add(() => {
                this.hide()
            })
            topBar.addControl(closeBtn)

            that.place(topBar, 0, 0, 100, 10)
            that.place(scroll, 0, 10, 100, 90)
            
            this.texture.addControl(topBar)
            this.texture.addControl(scroll)
        } else {
            that.place(scroll, 0, 0, 100, 100)
            this.texture.addControl(scroll)
        }

        scroll.addControl(buttons)
        scroll.height = "100%"

        if (this.menuOptions?.dragToScroll) {
            let isDragging = false;
            let dragStartY = 0;
            let initialScroll = 0;

            const startDrag = (y: number) => {
                isDragging = true;
                dragStartY = y;
                initialScroll = scroll.verticalBar.value;
            };

            const handleMove = (y: number) => {
                if (isDragging) {
                    const dy = y - dragStartY;
                    // Approximate scroll range
                    const scrollRange = Math.max(1, buttons.heightInPixels - scroll.heightInPixels);
                    // Map dy to 0-1 range and apply
                    scroll.verticalBar.value = initialScroll - (dy / scrollRange);
                    // Prevent button clicks if we dragged significantly
                    if (Math.abs(dy) > 10) {
                        (scroll as any)._wasDragged = true;
                    }
                }
            };

            const stopDrag = () => {
                isDragging = false;
                // Reset flag after a short delay so the button's pointerUp has time to read it
                setTimeout(() => { (scroll as any)._wasDragged = false; }, 50);
            };

            scroll.onPointerDownObservable.add((pi) => startDrag(pi.y));
            scroll.onPointerMoveObservable.add((pi) => handleMove(pi.y));
            scroll.onPointerUpObservable.add(() => stopDrag());
            
            // Expose for buttons
            (scroll as any)._startDrag = startDrag;
            (scroll as any)._handleMove = handleMove;
            (scroll as any)._stopDrag = stopDrag;
        }

        if(buttonsInfo) this.set(buttonsInfo)
    }

    set(buttonsInfo: MenuButton[]){

        function styleTextBlock(text: TextBlock, info: MenuButton, width: number){
            const baseSize = 25
            
            text.color = info.color ?? "white"
            text.text = info.label
            text.fontSize = baseSize
            
            const w = info.label.length*baseSize*.6
            if(w>width) text.fontSize = baseSize * width / w
                
            text.outlineColor = "black"
            text.outlineWidth = 4
        }

        function styleButton(button: Button, info: MenuButton){
            button.color = info.color ?? "white"
            button.background = "rgb(0,0,0,0)"
            button.width = "230px"
            button.height= "60px"
            button.setPaddingInPixels(5,5,5,5)
            button.pointerEnterAnimation = () => {
                button.background = "rgb(255,255,255,0.2)"
            }
            button.pointerOutAnimation = () => {
                button.background = "rgb(0,0,0,0)"
            }
            button.pointerUpAnimation = () => {
                button.scaleX = 1
                button.scaleY = 1
            }
            button.pointerDownAnimation = ()=>{
                button.scaleX = 0.95
                button.scaleY = 0.95
            }
            styleTextBlock(button.textBlock!, info, 230)
        }

        this.buttons.clearControls()
        for(const buttonInfo of buttonsInfo){
            if(buttonInfo.click){
                const button = Button.CreateSimpleButton(buttonInfo.label, buttonInfo.label)
                styleButton(button, buttonInfo)

                button.onPointerUpObservable.add(()=>{
                    if (this.menuOptions?.dragToScroll && (this.scrollViewer as any)._wasDragged) {
                        return;
                    }
                    try{
                        buttonInfo.click?.()
                    }catch(e){
                        console.error("Error in button click handler:", e)
                    }
                })
                
                if (this.menuOptions?.dragToScroll) {
                    button.onPointerDownObservable.add((pi) => (this.scrollViewer as any)._startDrag(pi.y));
                    button.onPointerMoveObservable.add((pi) => (this.scrollViewer as any)._handleMove(pi.y));
                    button.onPointerUpObservable.add(() => (this.scrollViewer as any)._stopDrag());
                }
                
                this.buttons.addControl(button)
            }
            else{
                const text = new TextBlock()
                styleTextBlock(text!, buttonInfo, 230)
                text.width = "230px"
                text.height= "40px"
                text.setPaddingInPixels(5,5,5,5)
                this.buttons.addControl(text)
            }
        }
    }

}
