import { Scene } from "@babylonjs/core";
import { Node3DFactory, Node3DGUI } from "../../Node3D";
import * as B from "@babylonjs/core";
import * as tools from "../../tools"
import { Node3DGUIContext } from "../../Node3DGUIContext";
import type { PromiseChain } from "../../../utils/async";
import { AsyncCallAggregator } from "../../../utils/call_aggregator";

const OFFSET = new B.Vector3(616,-3545, 2)

/**
 * @warning Pay attention to async race conditions, wrap every calls to this with a {@link PromiseChain}
 */
export class N3DRendering {

    private ctx!: Node3DGUIContext
    private renderScene!: Scene
    private rootNode!: B.Node
    private renderTarget!: B.RenderTargetTexture
    private camera!: B.UniversalCamera
    private light!: B.HemisphericLight

    constructor(
        readonly scene: B.Scene,
        readonly size: number,
        readonly parallelCount: number = 2,
    ){}

    async initialize(){
        console.log("Initializing N3DRendering...")

        const renderscene = this.renderScene = this.scene// new Scene(this.scene.getEngine(),{virtual:true})
        const rootNode = this.rootNode = new B.Node("N3D Rendering Root Node", renderscene)
        
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

        var renderTarget = this.renderTarget = new B.RenderTargetTexture('render to texture', {height:this.size,width:this.size*this.parallelCount*1.5}, this.scene, {doNotChangeAspectRatio:false})
        renderTarget.clearColor = new B.Color4(0,0,0,0)
        renderTarget.hasAlpha = true

        const camera = this.camera = new B.UniversalCamera("camera", OFFSET.clone().addInPlaceFromFloats(0, 2, 0), renderscene)
        camera.mode = B.Camera.ORTHOGRAPHIC_CAMERA
        camera.orthoLeft = -.5
        camera.orthoRight = (this.parallelCount)*1.5+-.5
        camera.orthoTop = .5
        camera.orthoBottom = -.5
        camera.target = OFFSET
        camera.rotation.z = Math.PI
        camera.fov = 0.48
        camera.parent = rootNode
        renderTarget.activeCamera = this.camera

        const light = this.light = new B.HemisphericLight("light", new B.Vector3(3, 10, 3), renderscene)
        light.intensity = 1
        light.parent = rootNode
        light.includedOnlyMeshes = []

        
        renderscene.customRenderTargets.push(renderTarget)

        await Promise.all([ctx.materialLight,ctx.materialMat,ctx.materialMetal,ctx.materialShiny].map(async mat=>{
            await Promise.all(mat.getBindedMeshes().map(mesh=>mesh.material!.forceCompilationAsync(mesh)))
        }))
        await renderscene.whenReadyAsync(true)

        return this
    }

    async renderThumbnail(factories: Node3DFactory<Node3DGUI,any>[]) {

        const guis = await Promise.all(factories.map(f => f.createGUI(this.ctx)))
        guis.filter(gui => {
            if (!gui.root) {
                console.error(`GUI root is undefined for node3d factory. The createGUI method must return an object with a 'root' TransformNode property.`)
                return false
            }
            else return true
        })

        this.renderTarget.renderList!.length = 0
        let i = 0
        for(const gui of guis){
            this.renderTarget.renderList!.push(...gui.root.getChildMeshes())
            for(const mesh of gui.root.getChildMeshes()){
                mesh.lightSources.length = 0
                mesh.lightSources.push(this.light)
            }
            gui.root.parent = this.rootNode
            gui.root.position = OFFSET.clone().addInPlaceFromFloats(i * 1.5, 0, 0)
            i++
        }

        await this.renderScene.whenReadyAsync(true)

        this.renderTarget.render()

        for(const gui of guis){
            gui.dispose()
            gui.root.dispose()
        }

    }

    dispose(){
        console.log("Disposing N3DRendering...")
        this.renderTarget.dispose()
        this.camera.dispose()
        this.light.dispose()
        this.rootNode.dispose()
    }

    get texture(){
        return this.renderTarget
    }

    async getImageURL(count: number){
        const srcData = await this.texture.readPixels() as Float32Array|Int32Array
        const srcSize = this.texture.getSize()
        const tarSize = this.texture.getSize().height
        const tarCanvas = document.createElement('canvas')
        tarCanvas.width = tarSize
        tarCanvas.height = tarSize
        const ctx = tarCanvas.getContext('2d')!!
        const tarData = ctx.createImageData(tarSize, tarSize)
        
        return Array.from({length:count},(_,i)=>{
            const offset = Math.floor(i * tarSize * 1.5) * 4
            if(srcData instanceof Float32Array){
                for(let y = 0; y < tarSize; y++){
                    for(let x = 0; x < tarSize; x++){
                        const srcIdx = (y * srcSize.width + x) * 4 +offset
                        const dstIdx = ((tarSize - 1 - y) * tarSize + x) * 4
                        tarData.data[dstIdx + 0] = Math.min(255, Math.max(0, srcData[srcIdx + 0] * 255))
                        tarData.data[dstIdx + 1] = Math.min(255, Math.max(0, srcData[srcIdx + 1] * 255))
                        tarData.data[dstIdx + 2] = Math.min(255, Math.max(0, srcData[srcIdx + 2] * 255))
                        tarData.data[dstIdx + 3] = Math.min(255, Math.max(0, srcData[srcIdx + 3] * 255))
                    }
                }
            } else {
                for(let y = 0; y < tarSize; y++){
                    for(let x = 0; x < tarSize; x++){
                        const srcIdx = (y * srcSize.width + x) * 4 +offset
                        const dstIdx = ((tarSize - 1 - y) * tarSize + x) * 4
                        tarData.data[dstIdx + 0] = srcData[srcIdx + 0]
                        tarData.data[dstIdx + 1] = srcData[srcIdx + 1]
                        tarData.data[dstIdx + 2] = srcData[srcIdx + 2]
                        tarData.data[dstIdx + 3] = srcData[srcIdx + 3]
                    }
                }
            }
            ctx.putImageData(tarData, 0, 0)
            return tarCanvas.toDataURL()
        })
    }

    public createAggregator(){
        const renderer = this

        const aggregator = new AsyncCallAggregator<Node3DFactory<Node3DGUI,any>,string>(
            this.parallelCount,
            50,
            async (factories)=>{
                console.log("factories", factories)
                await renderer.renderThumbnail(factories)
                return await renderer.getImageURL(factories.length)
            }
        )

        return {
            async dispose(){
                await new Promise<void>(resolve=>aggregator.addOnFinish(resolve))
                renderer.dispose()
            },
            draw(factory: Node3DFactory<Node3DGUI,any>){
                return aggregator.add(factory)
            }
        }
    }
}