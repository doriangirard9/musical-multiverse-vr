import { Engine, Scene } from "@babylonjs/core";
import { Node3DFactory, Node3DGUI } from "../../Node3D";
import * as B from "@babylonjs/core";
import * as tools from "../../tools"

export class N3DRendering {

    static async renderThumbnail(scene: B.Scene, node3d: Node3DFactory<Node3DGUI,any>, size: number) {
        const renderscene = new Scene(scene.getEngine())
        
        const gui = await node3d.createGUI({
            babylon: B,
            materialLight: new B.StandardMaterial("light", renderscene),
            materialMat: new B.StandardMaterial("mat", renderscene),
            materialMetal: new B.StandardMaterial("metal", renderscene),
            materialShiny: new B.StandardMaterial("shiny", renderscene),
            tools,
            scene: renderscene,
            highlight() { },
            unhighlight() { },
        })

        var renderTarget = new B.RenderTargetTexture('render to texture', size, scene)
        renderTarget.clearColor = new B.Color4(0,0,0,0)
        renderTarget.hasAlpha = true

        // Ensure gui.root exists before adding to renderList
        if (!gui.root) {
            throw new Error(`GUI root is undefined for node3d factory. The createGUI method must return an object with a 'root' TransformNode property.`)
        }

        renderTarget.renderList!.push(...gui.root.getChildMeshes());

        const camera = new B.UniversalCamera("camera", new B.Vector3(0, 2, 0), renderscene);
        camera.target = new B.Vector3(0, 0, 0);
        camera.rotation.z = Math.PI
        camera.fov = 0.48;

        const light = new B.HemisphericLight("light", new B.Vector3(3, 10, 3), renderscene);
        light.intensity = 1;
        
        renderscene.activeCamera = camera

        renderscene.customRenderTargets.push(renderTarget)

        await renderscene.whenReadyAsync()

        renderscene.render()

        renderscene.dispose()

        return renderTarget
    }

    static async textureToImageURL(texture: B.RenderTargetTexture): Promise<string> {
        const data = await texture.readPixels() as Float32Array|Int32Array
        const width = texture.getSize().width
        const height = texture.getSize().height
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