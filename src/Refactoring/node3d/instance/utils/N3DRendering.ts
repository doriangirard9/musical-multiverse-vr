import { Engine, Scene } from "@babylonjs/core";
import { Node3DFactory, Node3DGUI } from "../../Node3D";
import * as B from "@babylonjs/core";
import * as tools from "../../tools"

export class N3DRendering {

    static async renderThumbnail(engine: B.AbstractEngine, node3d: Node3DFactory<Node3DGUI,any>, size: number) {
        const scene = new Scene(engine)
        
        const gui = await node3d.createGUI({
            babylon: B,
            materialLight: new B.StandardMaterial("light", scene),
            materialMat: new B.StandardMaterial("mat", scene),
            materialMetal: new B.StandardMaterial("metal", scene),
            materialShiny: new B.StandardMaterial("shiny", scene),
            tools,
            scene: scene,
            highlight() { },
            unhighlight() { },
        })

        var renderTarget = new B.RenderTargetTexture('render to texture', size, scene)

        // Ensure gui.root exists before adding to renderList
        if (!gui.root) {
            throw new Error(`GUI root is undefined for node3d factory. The createGUI method must return an object with a 'root' TransformNode property.`)
        }

        await new Promise<void>(r=>setTimeout(()=>r(),1000)) // Wait a bit for GUI to be ready

        renderTarget.renderList!.push(...gui.root.getChildMeshes());

        const camera = new B.UniversalCamera("camera", new B.Vector3(0, 2, 0), scene);
        camera.target = new B.Vector3(0, 0, 0);
        camera.fov = 0.5;

        const light = new B.HemisphericLight("light", new B.Vector3(0, 1, 0), scene);
        light.intensity = 1.0;
        
        scene.activeCamera = camera

        scene.customRenderTargets.push(renderTarget)

        await scene.whenReadyAsync()

        scene.render()

        return renderTarget
    }

}