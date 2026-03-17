import { CreatePlane, Mesh, Quaternion, Scene, Vector3 } from "@babylonjs/core"
import { AdvancedDynamicTexture, Button, Image, Rectangle, ScrollViewer, StackPanel, TextBlock } from "@babylonjs/gui"
import { Node3dManager } from "../../app/Node3dManager"
import { N3DRendering } from "../../node3d/instance/utils/N3DRendering"
import { N3DText } from "../../node3d/instance/utils/N3DText"


export class ShopPanel{

    plane: Mesh
    texture: AdvancedDynamicTexture
    label

    constructor(
        private scene: Scene
    ){
        
        this.plane = CreatePlane("shopPanel", {width: 2, height: 1})
        this.texture = AdvancedDynamicTexture.CreateForMesh(this.plane, 1024, 512)
        this.label = new N3DText("label", [this.plane], scene)

        const list = this.createItemList(4,[...Node3dManager.getInstance().builder.FACTORY_KINDS])
        list.width = "65%"
        list.height = "100%"
        list.horizontalAlignment = StackPanel.HORIZONTAL_ALIGNMENT_LEFT
        list.left = "0%"
        this.texture.addControl(list)

        const clipboard = this.createClipboard()
        clipboard.width = "35%"
        clipboard.height = "100%"
        clipboard.horizontalAlignment = StackPanel.HORIZONTAL_ALIGNMENT_LEFT
        clipboard.left = "65%"
        this.texture.addControl(clipboard)
    }

    private updateClipboard: ()=>void = ()=>{}

    private createClipboard(){
        const container = new Rectangle()
        container.background = "rgb(0,0,0,0.5)"
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
        root.background = "rgb(0,0,0,0.5)"

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

        Promise.all([...Node3dManager.getInstance().builder.FACTORY_KINDS].map(async kind=>{
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

    private async createItem(kind: string){
        console.log("Creating item for kind", kind)
        const factory = await Node3dManager.getInstance().builder.getFactory(kind)
        if(!factory) return

        const thumbnail = await N3DRendering.renderThumbnail(this.scene, factory, 128)
        const url = await N3DRendering.textureToImageURL(thumbnail)
        thumbnail.dispose()

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
}