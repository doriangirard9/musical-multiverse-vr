import * as B from "@babylonjs/core";
import { AsyncCallAggregator } from "../../utils/call_aggregator";

const OFFSET = new B.Vector3(616,-3545, 2)
const DEBUG = true

/**
 * An utility class for rendering thumbnails of 3D objects.
 * The objects have to centered and fitted in a 1x1x1 box for correct rendering.
 * It supports small overlap between objects, but too much overlap may cause rendering issues.
 * 
 * @warning Pay attention to async race conditions, wrap every calls to this with a {@link PromiseChain}
 * 
 * Get aggragators with {@link createAggregator} to render thumbnails with batching mechanism and
 * avoid race conditions.
 * 
 */
export class ThumbnailRenderer {

    private rootNode!: B.Node
    private renderTarget!: B.RenderTargetTexture
    private camera!: B.UniversalCamera
    private light!: B.HemisphericLight
    private renderingScene!: B.Scene

    constructor(
        readonly scene: B.Scene,
        readonly size: number,
        readonly parallelCount: number = 2,
    ){
    }

    async initialize(){
        this.log("Initializing Thumbnail Rendering...")

        this.renderingScene = new B.Scene(this.scene.getEngine(),{virtual:true})

        const rootNode = this.rootNode = new B.Node("N3D Rendering Root Node", this.renderingScene)

        var renderTarget = this.renderTarget = new B.RenderTargetTexture('render to texture', {height:this.size,width:this.size*this.parallelCount*1.5}, this.scene, {doNotChangeAspectRatio:false})
        renderTarget.clearColor = new B.Color4(0,0,0,0)
        renderTarget.hasAlpha = true

        const camera = this.camera = new B.UniversalCamera("camera", OFFSET.clone().addInPlaceFromFloats(0, 2, 0), this.renderingScene)
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

        const light = this.light = new B.HemisphericLight("light", new B.Vector3(3, 10, 3), this.renderingScene)
        light.intensity = 1
        light.parent = rootNode
        light.includeOnlyWithLayerMask = 0x0000200
        rootNode.setEnabled(false)

        
        this.renderingScene.customRenderTargets.push(renderTarget)

        await this.renderingScene.whenReadyAsync(true)

        return this
    }

    async renderThumbnail(nodes: B.TransformNode[]) {
        this.rootNode.setEnabled(true)
        console.log("Rendering thumbnail for", nodes.map(n=>n.name))

        this.renderTarget.renderList!.length = 0
        let i = 0
        for(const node of nodes){
            if(this.scene.add)
            this.renderTarget.renderList!.push(...node.getChildMeshes())
            for(const mesh of node.getChildMeshes()){
                mesh.lightSources.length = 0
                mesh.lightSources.push(this.light)
                mesh.layerMask = 0x0000200
            }
            node.parent = this.rootNode
            node.position = OFFSET.clone().addInPlaceFromFloats(i * 1.5, 0, 0)
            i++
        }

        await this.renderingScene.whenReadyAsync(true)

        await Promise.all(
            nodes.flatMap(n=>n.getChildMeshes())
                .map(async mesh =>{
                    await mesh.material?.forceCompilationAsync(mesh)
                })
        )

        await this.renderingScene.whenReadyAsync(true)
        this.renderTarget.render()
        await this.renderingScene.whenReadyAsync(true)
        this.renderTarget.render()

        this.rootNode.setEnabled(false)
        console.log("Rendering done for", nodes.map(n=>n.name))
    }

    dispose(){
        this.log("Disposing N3DRendering...")
        this.renderTarget.dispose()
        this.camera.dispose()
        this.light.dispose()
        this.rootNode.dispose()
        this.renderingScene.dispose()
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
        
        console.log("Converting thumbnail to image URL...")
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

        const aggregator = new AsyncCallAggregator<B.TransformNode,string>(
            this.parallelCount,
            50,
            async nodes=>{
                await renderer.renderThumbnail(nodes)
                return await renderer.getImageURL(nodes.length)
            }
        )

        return {
            async dispose(){
                await new Promise<void>(resolve=>aggregator.addOnFinish(resolve))
                renderer.dispose()
            },
            draw(node: B.TransformNode){
                return aggregator.add(node)
            }
        }
    }

    private log(...args: any[]){
        if(DEBUG) console.log("[THUMBNAIL RENDERING] ", ...args)
    }
}