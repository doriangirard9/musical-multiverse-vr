import { Engine, Scene } from "@babylonjs/core";
import { Node3DFactory, Node3DGUI } from "../../Node3D";
import * as B from "@babylonjs/core";
import * as tools from "../../tools"
import { Node3DGUIContext } from "../../Node3DGUIContext";
import { PromiseChain } from "../../../utils/async";

export class N3DRendering {

    private ctx!: Node3DGUIContext
    private renderScene!: Scene
    private renderTarget!: B.RenderTargetTexture
    private camera!: B.UniversalCamera
    private light!: B.HemisphericLight

    constructor(
        readonly scene: B.Scene,
        readonly size: number
    ){}

    async initialize(){
        console.log("Initializing N3DRendering...")
        const renderscene = this.renderScene = new Scene(this.scene.getEngine())
        
        const ctx: Node3DGUIContext = this.ctx = {
            babylon: B,
            materialLight: new B.StandardMaterial("light", renderscene),
            materialMat: new B.StandardMaterial("mat", renderscene),
            materialMetal: new B.StandardMaterial("metal", renderscene),
            materialShiny: new B.StandardMaterial("shiny", renderscene),
            materialTransparent: new B.StandardMaterial("transparent", renderscene),
            tools,
            scene: renderscene,
            highlight() { },
            unhighlight() { },
        }

        var renderTarget = this.renderTarget = new B.RenderTargetTexture('render to texture', this.size, this.scene, {doNotChangeAspectRatio:false})
        renderTarget.clearColor = new B.Color4(0,0,0,0)
        renderTarget.hasAlpha = true

        const camera = this.camera = new B.UniversalCamera("camera", new B.Vector3(0, 2, 0), renderscene);
        camera.target = new B.Vector3(0, 0, 0);
        camera.rotation.z = Math.PI
        camera.fov = 0.48;

        const light = this.light = new B.HemisphericLight("light", new B.Vector3(3, 10, 3), renderscene);
        light.intensity = 1;
        
        renderscene.activeCamera = camera

        renderscene.customRenderTargets.push(renderTarget)

        await Promise.all([ctx.materialLight,ctx.materialMat,ctx.materialMetal,ctx.materialShiny].map(async mat=>{
            await Promise.all(mat.getBindedMeshes().map(mesh=>mesh.material!.forceCompilationAsync(mesh)))
        }))
        await renderscene.whenReadyAsync(true)

        return this
    }

    async renderThumbnail(node3d: Node3DFactory<Node3DGUI,any>) {
        const gui = await node3d.createGUI(this.ctx)
        if (!gui.root) {
            throw new Error(`GUI root is undefined for node3d factory. The createGUI method must return an object with a 'root' TransformNode property.`)
        }
        this.renderTarget.renderList!.length = 0
        this.renderTarget.renderList!.push(...gui.root.getChildMeshes())

        await this.renderScene.whenReadyAsync(true)
        this.renderScene.render()

        gui.dispose()
        gui.root.dispose()
    }

    dispose(){
        console.log("Disposing N3DRendering...")
        this.renderScene.rootNodes.forEach(n => n.dispose())
        this.renderTarget.dispose()
        this.camera.dispose()
        this.light.dispose()
        this.renderScene.dispose()
    }

    get texture(){
        return this.renderTarget
    }

    async getImageURL(){
        const data = await this.texture.readPixels() as Float32Array|Int32Array
        const width = this.texture.getSize().width
        const height = this.texture.getSize().height
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!!
        const imageData = ctx.createImageData(width, height)
        
        if(data instanceof Float32Array){
            for(let y = 0; y < height; y++){
                for(let x = 0; x < width; x++){
                    const srcIdx = (y * width + x) * 4
                    const dstIdx = ((height - 1 - y) * width + x) * 4
                    imageData.data[dstIdx + 0] = Math.min(255, Math.max(0, data[srcIdx + 0] * 255))
                    imageData.data[dstIdx + 1] = Math.min(255, Math.max(0, data[srcIdx + 1] * 255))
                    imageData.data[dstIdx + 2] = Math.min(255, Math.max(0, data[srcIdx + 2] * 255))
                    imageData.data[dstIdx + 3] = Math.min(255, Math.max(0, data[srcIdx + 3] * 255))
                }
            }
        } else {
            for(let y = 0; y < height; y++){
                for(let x = 0; x < width; x++){
                    const srcIdx = (y * width + x) * 4
                    const dstIdx = ((height - 1 - y) * width + x) * 4
                    imageData.data[dstIdx + 0] = data[srcIdx + 0]
                    imageData.data[dstIdx + 1] = data[srcIdx + 1]
                    imageData.data[dstIdx + 2] = data[srcIdx + 2]
                    imageData.data[dstIdx + 3] = data[srcIdx + 3]
                }
            }
        }
        
        ctx.putImageData(imageData, 0, 0)
        return canvas.toDataURL()
    }

}