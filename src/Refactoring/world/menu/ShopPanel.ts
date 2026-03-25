import { CreatePlane, Effect, Mesh, Quaternion, Scene, Trajectory, Tuple, Vector3 } from "@babylonjs/core"
import { AdvancedDynamicTexture, Button, Container, Control, Image, Rectangle, ScrollViewer, StackPanel, TextBlock } from "@babylonjs/gui"
import { Node3dManager } from "../../app/Node3dManager"
import { N3DRendering } from "../../node3d/instance/utils/N3DRendering"
import { N3DText } from "../../node3d/instance/utils/N3DText"
import { Node3DBuilder } from "../../app/Node3DBuilder"


export class ShopPanel{

    plane: Mesh
    texture: AdvancedDynamicTexture
    label

    constructor(
        private scene: Scene
    ){
        const that = this
        
        this.plane = CreatePlane("shopPanel", {width: 2, height: 1})
        this.texture = AdvancedDynamicTexture.CreateForMesh(this.plane, 1024, 512)
        this.label = new N3DText("label", [this.plane], scene)


        // Item List
        const items = new Container()
        
        function setItems(kinds: string[]){
            items.clearControls()
            const list = that.createItemList(4,kinds)
            that.place(list, 0,0, 100,100)
            items.addControl(list)
        }


        // Sub menu
        const submenu = new Container()

        function setSubMenu(selection: string, submenus: Record<string, string[]>){
            const options = Object.entries(submenus)
            if(options.length===1) selection = options[0][0]

            submenu.clearControls()
            const buttons = that.createButtons(
                options.map(([label, kinds])=>({
                    label,
                    selected: label === selection,
                    action: ()=>{
                        setSubMenu(label, submenus)
                        setItems(kinds)
                    }
                }))
            )
            if(options.length===1) setItems(options[0][1])
            submenu.addControl(buttons)
            buttons.horizontalAlignment = StackPanel.HORIZONTAL_ALIGNMENT_CENTER
            buttons.height = "100%"
        }


        // Menu
        const menu = new Container()

        function setMenu(selection: string, menus: Record<string, Record<string, string[]>>){
            menu.clearControls()
            const buttons = that.createButtons(
                Object.entries(menus)
                    .map(([label, submenus])=>({
                        label,
                        selected: label === selection,
                        action: ()=>{
                            setMenu(label, menus)
                            setSubMenu("", submenus)
                        }
                    }))
            )
            menu.addControl(buttons)
            buttons.horizontalAlignment = StackPanel.HORIZONTAL_ALIGNMENT_CENTER
            buttons.height = "100%"
        }

        
        // Clipboard
        const clipboard = this.createClipboard()

        const topbar = that.rect()
        that.place(topbar, 0,0, 100,15)
        that.texture.addControl(topbar)

        const body = that.rect()
        that.place(body, 0,15, 100,85)
        that.texture.addControl(body)

        body.addControl(items)
        that.place(items, 0,0, 65,100)

        body.addControl(clipboard)
        that.place(clipboard, 65,0, 35,100)

        topbar.addControl(menu)
        that.place(menu, 0,0, 100,50)

        topbar.addControl(submenu)
        that.place(submenu, 0,50, 100,50)

        // Init menu
        ;(async ()=>{
            const builder = Node3dManager.getInstance().builder
            const kinds = builder.FACTORY_KINDS
            const factories = (await Promise.all(kinds.map(async kind=>{
                    const factory = await builder.getFactory(kind)
                    if(factory==null)return null
                    else return [kind,factory] as const
                })))
                .filter(it=>it!=null)
            const dict = Object.fromEntries(factories)

            const menus = {
                Audio:{
                    Generator: [],
                    Effect: [],
                    Other: [],
                },
                MIDI:{
                    Generator: [],
                    Instrument: [],
                    Other: [],
                },
                Automation:{
                    Automation: [],
                },
                Other:{
                    Other: [],
                },
                Output:{
                    Output:[]
                },
            }

            for(const [kind, factory] of factories){
                const target = [] as string[][]
                
                if(factory.tags.includes("consumer")) target.push(menus.Output.Output)

                if(factory.tags.includes("automation")) target.push(menus.Automation.Automation)

                if(factory.tags.includes("midi")){
                    if(factory.tags.includes("generator")) target.push(menus.MIDI.Generator)
                    else if(factory.tags.includes("instrument")) target.push(menus.MIDI.Instrument)
                    else target.push(menus.MIDI.Other)
                }
                else if(factory.tags.includes("audio")){
                    if(factory.tags.includes("generator")) target.push(menus.Audio.Generator)
                    else if(factory.tags.includes("effect")) target.push(menus.Audio.Effect)
                    else target.push(menus.Audio.Other)
                }
                console.log(target)
                if(target.length===0) target.push(menus.Other.Other)

                target.forEach(t=>t.push(kind))
            }
            setMenu("", menus)
        })()
    }

    private createButtons(buttons: {label:string, selected:boolean, action:()=>void}[] = []){
        const list = new StackPanel()
        list.isVertical = false
        for(const {label,selected,action} of buttons){
            const button = Button.CreateSimpleButton("button", label)
            button.color = "white"
            button.width = "150px"
            if(selected) button.background = "rgb(255,255,255,0.5)"
            else button.onPointerUpObservable.add(action)
            list.addControl(button)
        }
        return list
    }

    private updateClipboard: ()=>void = ()=>{}

    private createClipboard(){
        const container = new Rectangle()
        this.updateClipboard = async()=>{
            container.clearControls()
            const kind = await navigator.clipboard.readText()
            const item = await this.createItem(kind)
            if(item){
                item.width = "300px"
                item.height = "300px"
                container.addControl(item)
            }
        }
        this.updateClipboard()
        return container
    }

    private createItemList(columns: number, kinds: string[]){
        const root = new Rectangle()

        const scroll = new ScrollViewer()
        scroll.width = "100%"
        scroll.height = "100%"
        root.addControl(scroll)

        const stack = Array.from({length:columns},(_,i)=>{
            const stack = new StackPanel()
            scroll.addControl(stack)
            stack.width = (90/columns)+"%"
            stack.horizontalAlignment = StackPanel.HORIZONTAL_ALIGNMENT_LEFT
            stack.left = `${i*(90/columns)+5}%`
            return stack
        })

        Promise.all(kinds.map(async kind=>{
            const item = await this.createItem(kind)
            if(!item) return
            item.width = "150px"
            item.height = "150px"

            let min = Infinity
            let index =0
            for(let i=0; i<stack.length; i++){
                if(stack[i].children.length<min){
                    min = stack[i].children.length
                    index = i
                }
            }
            stack[index].addControl(item)
        }))

        return root
    }

    private images = {} as Record<string, string>

    private async createItem(kind: string){
        const factory = await Node3dManager.getInstance().builder.getFactory(kind)
        if(!factory) return

        const url = this.images[kind] ??= await (async()=>{
            const thumbnail = await N3DRendering.renderThumbnail(this.scene, factory, 128)
            const ret = await N3DRendering.textureToImageURL(thumbnail)
            thumbnail.dispose()
            return ret
        })()

        const uiThumbnail = new Image("thumb", url)
        const uiName = new TextBlock("name", factory.label)
        
        const container = new Button("container")
        container.pointerEnterAnimation = ()=>{
            container.background = "rgb(255,255,255,0.2)"
            this.label.set([
                {content: factory.label},
                {content: factory.description, size: .5},
                {content: factory.tags.join(", "), size: .4, color: "#ffffff9d"},
            ])
            this.label.show()
            this.label.updatePosition()
        }
        container.pointerOutAnimation = ()=>{
            container.background = "rgb(0,0,0,0)"
            this.label.hide()
            this.label.updatePosition()
        }
        container.pointerUpAnimation = ()=>{
            this.hide()
            Node3dManager.getInstance().createNode3d(kind, this.plane.absolutePosition)
        }

        container.addControl(uiThumbnail)
        uiThumbnail.width = "70%"
        uiThumbnail.height = "70%"

        container.addControl(uiName)
        uiName.verticalAlignment = TextBlock.VERTICAL_ALIGNMENT_BOTTOM
        uiName.color = "white"
        uiName.fontSize = 14
        container.width = "100%"
        uiName.height = "20%"

        return container
    }

    makeFollow(){
        const o = this.scene.onAfterPhysicsObservable.add(()=>{
            const ray = this.scene.activeCamera!.getForwardRay()
            const position = ray.direction.scale(1).addInPlace(ray.origin)
            this.plane.position.addInPlace(position).scaleInPlace(0.5)
            this.plane.rotationQuaternion = Quaternion.FromLookDirectionLH(ray.direction.scale(-1), Vector3.Up())
                .multiplyInPlace(Quaternion.FromEulerAngles(0.1, 0, 0))
        })

        this.plane.onDisposeObservable.addOnce(()=>{
            o.remove()
        })

        return o
    }

    show(){
        this.plane.isVisible = true
        this.updateClipboard()
    }

    hide(){
        this.plane.isVisible = false
    }

    toggle(){
        if(this.plane.isVisible){
            this.hide()
        }
        else{
            this.show()
        }
    }

    place(control: Control, x: number, y: number, width: number, height: number){
        control.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP
        control.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT
        control.left = x+"%"
        control.top = y+"%"
        control.width = width+"%"
        control.height = height+"%"
    }

    rect(){
        const rect = new Rectangle()
        rect.background = "rgb(0,0,0,0.5)"
        return rect
    }
}