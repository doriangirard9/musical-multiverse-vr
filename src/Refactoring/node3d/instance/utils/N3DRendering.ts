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

        const light = new B.HemisphericLight("light", new B.Vector3(0, 1, 0), renderscene);
        light.intensity = 1.0;
        
        renderscene.activeCamera = camera

        renderscene.customRenderTargets.push(renderTarget)

        await renderscene.whenReadyAsync()

        renderscene.render()

        renderscene.dispose()

        return renderTarget
    }

}