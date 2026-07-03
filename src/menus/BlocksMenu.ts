import { Scene } from "@babylonjs/core"
import { Button, Container, Control, Image, Rectangle, ScrollViewer, TextBlock } from "@babylonjs/gui"
import { AbstractMenu } from "./AbstractMenu"

export interface BMenuMenu {
    width: number
    items: BMenuBlock[]
}

export interface BMenuBlock {
    text?: string
    img?: string
    onClick?: ()=>void,
    sub?: BMenuMenu
    color?: string
    disabled?: boolean
    size?: number
    width?: number
    height?: number
}

export type BMenuGrid = (BMenuBlock|null)[][]

/**
 * A grid-based menu panel where blocks can occupy multiple cells.
 * Each block is positioned by its top-left corner in the grid.
 */
export class BlocksMenu extends AbstractMenu {

    constructor(
        scene: Scene,
        renderScene: Scene,
        menuData?: BMenuMenu
    ) {
        super(scene, renderScene)
        this.initPanel("choice_menu", 1, 1, 256)

        if(menuData) this.set(menuData)
    }

    set(menuData: BMenuMenu){
        const bar = this.scrollViewer?.verticalBar?.value
        this.scrollViewer = undefined as ScrollViewer|undefined

        this.texture.executeOnAllControls(c=>c.dispose())

        // Layout
        const layout = BlocksMenu.layout(menuData)

        const width = 1
        const height = layout.length/layout[0].length*width

        this.resizePanel(width, height, 256)

        // Container
        const menu = this.createMenu({sub:menuData}!, 256*width, 256*height)
        this.texture.addControl(menu)

        if(!!bar && this.scrollViewer!=undefined) this.scrollViewer.verticalBar.value = bar
    }

    createMenu(block: BMenuBlock, width: number, height: number){
        let root // The root container of the menu
        let target // The container the items will be put into
    

        const layout = BlocksMenu.layout(block.sub!)

        // Create the container
        let internalWidth = width
        let internalHeight = layout.length/layout[0].length*width

        if(internalHeight>height){
            root = new ScrollViewer()
            this.scrollViewer = root
            root.barSize=internalWidth*.04
            internalWidth*=.95

            target = new Container()
            target.widthInPixels = internalWidth
            target.heightInPixels = internalHeight
            root.addControl(target)
        }
        else{
            root = new Rectangle()
            target = root
        }
        root.background = "rgb(0,0,0,0.5)"
        root.widthInPixels = width
        root.heightInPixels = height
        root.thickness = 1
        root.color = block.color ?? "white"

        BlocksMenu.placeBlocks(
            layout,
            internalWidth*.01, internalHeight*.01,
            internalWidth*.98, internalHeight*.98,
            (sub_block, w, h) => {
                let control = null

                if(sub_block.onClick){
                    if (sub_block.text && sub_block.img) control = BlocksMenu.createTextImageButton(sub_block)
                    else if(sub_block.text) control = BlocksMenu.createTextButton(sub_block)
                    else if(sub_block.img) control = BlocksMenu.createImageButton(sub_block)
                }
                else if(sub_block.sub){
                    control = this.createMenu(sub_block, w, h)
                }
                else if(sub_block.text){
                    control = BlocksMenu.createLabel(sub_block) 
                }
                else if(sub_block.img){
                    control = BlocksMenu.createImage(sub_block)
                }
                if(control) BlocksMenu.setCommon(control, sub_block)
                if(control) target.addControl(control)
                return control
            }
        )

        return root
    }
    private static setCommon(button: Control, block: BMenuBlock){
        button.isEnabled = !block.disabled
        if(!!block.disabled) button.alpha = 0.5
    }

    private static setButtonCommon(button: Button, block: BMenuBlock){
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
        button.onPointerUpObservable.add(()=>{
            block.onClick?.()
        })
    }

    /* A pure text button */
    static createTextButton(block: BMenuBlock){
        const button = Button.CreateSimpleButton(block.text!, block.text!)
        button.color = block.color ?? "white"
        button.fontSizeInPixels = 40
        BlocksMenu.setCommon(button, block)
        BlocksMenu.fitText(button.textBlock!)
        BlocksMenu.setButtonCommon(button, block)
        return button
    }

    /* A pure image button */
    static createImageButton(block: BMenuBlock){
        const button = Button.CreateImageOnlyButton("image button", block.img!)
        button.color = block.color ?? "white"
        button.fontSizeInPixels = 40
        BlocksMenu.setCommon(button, block)
        BlocksMenu.setButtonCommon(button, block)
        return button
    }

    /* A text and image button */
    static createTextImageButton(block: BMenuBlock){
        const button = Button.CreateImageButton("image button", block.text!, block.img!)
        button.color = block.color ?? "white"
        button.fontSizeInPixels = 40
        BlocksMenu.setCommon(button, block)
        BlocksMenu.fitText(button.textBlock!)
        BlocksMenu.setButtonCommon(button, block)
        return button
    }

    /* A pure text label */
    static createLabel(block: BMenuBlock){
        const label = new TextBlock(block.text!, block.text!)
        label.color = block.color ?? "white"
        label.fontSizeInPixels = 40
        BlocksMenu.setCommon(label, block)
        BlocksMenu.fitText(label)
        return label
    }

    /* A pure image label */
    static createImage(block: BMenuBlock){
        const image = new Image("image", block.img!)
        image.color = block.color ?? "white"
        image.fontSizeInPixels = 40
        BlocksMenu.setCommon(image, block)
        return image
    }

    /**
     * Resize the text in a TextBlock to fit within a maximum number of lines.
     * @param text The TextBlock to resize.
     */
    static fitText(control: TextBlock) {
        control.textWrapping = false
        control.onDirtyObservable.addOnce(()=>{
            const textWidth = control.text.length*control.fontSizeInPixels*.8
            if(textWidth>control.widthInPixels) control.fontSizeInPixels *= control.widthInPixels / textWidth

            const textHeight = control.fontSizeInPixels*2
            if(textHeight>control.heightInPixels) control.fontSizeInPixels *= control.heightInPixels / textHeight
        })
    }

    /**
     * Layout the blocks in a grid based on their width and height.
     * @param menuData 
     * @returns 
     */
    static layout(menuData: BMenuMenu) {
        const grid = [] as (BMenuBlock|null|"empty")[][]

        let x = 0
        let y = 0

        // Layout
        for(const block of menuData.items){
            block.height ??= 1
            block.width ??= 1

            // Block invalid
            if(block.width>menuData.width)continue

            // Find first available position.
            // Also resize grid when a new line is needed
            // If no space on the same line, fill with space and create a new line.
            while(true){
                if(x==menuData.width){
                    y++
                    x = 0
                }
                if(y>=grid.length){
                    grid.push(Array.from({length:menuData.width}, ()=>"empty"))
                }
                if(grid[y][x]==="empty"){
                    if(x+block.width > grid[y].length){
                        grid[y][x] = {}
                    }
                    else break
                }
                x++
            }

            // Resize the grid to accommodate the block's height
            while(y+block.height > grid.length){
                grid.push(Array.from({length:menuData.width}, ()=>"empty"))
            }


            // Fill the grid
            grid[y][x] = block
            for(let dx=0;dx<block.width;dx++){
                for(let dy=0;dy<block.height;dy++){
                    if(dx==0 && dy==0)continue
                    grid[y+dy][x+dx] = null
                }
            }
            
        }
        // Replace empty by null
        while(y<grid.length){
            if(grid[y][x]==="empty") grid[y][x] = null
            x++
            if(x==grid[y].length){
                x = 0
                y++
            }
        }

        return grid as BMenuGrid
    }

    /**
     * Instantiate the grid of blocks into controls using the provided factory function.
     * @param grid The grid of blocks to instantiate.
     * @param left The left position of the grid in pixels.
     * @param top The top position of the grid in pixels.
     * @param width The total width of the grid in pixels.
     * @param height The total height of the grid in pixels.
     * @param factory The factory function that creates a Control for each block.
     * @returns The instantiated grid of controls and blocks.
     */
    static placeBlocks(
        grid: BMenuGrid,
        left: number, top: number,
        width: number, height: number,
        factory: (block: BMenuBlock, width:number, height:number) => Control|null
    ){
        if(grid.length==0)return
        if(grid[0].length==0)return

        const cellWidth: number = width / grid[0].length
        const cellHeight: number = height / grid.length

        for(let x=0;x<grid[0].length;x++){
            for(let y=0;y<grid.length;y++){
                const block = grid[y][x]
                if(block===null)continue

                const blockWidth = cellWidth * (block.width ?? 1) * (block.size ?? 1)
                const blockHeight = cellHeight * (block.height ?? 1) * (block.size ?? 1)
                
                const realWidth = blockWidth * (block.size ?? .95)
                const realHeight = blockHeight * (block.size ?? .95)

                const control = factory(block, realWidth, realHeight)
                if(!control) continue

                control.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
                control.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP

                control.leftInPixels = left + x*cellWidth + (blockWidth - realWidth)/2
                control.topInPixels = top + y*cellHeight + (blockHeight - realHeight)/2
                control.widthInPixels = realWidth
                control.heightInPixels = realHeight
            }
        }
        
    }
    
}
