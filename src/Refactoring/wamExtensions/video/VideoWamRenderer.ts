import { Scene, HtmlElementTexture, StandardMaterial, AbstractMesh, Color3 } from "@babylonjs/core";
import { VideoRenderer } from "./VideoRenderer";
import { VideoDelegate } from "./VideoExtension";

export class VideoWamRenderer {
    private canvas: HTMLCanvasElement;
    private renderer: VideoRenderer;
    private texture: HtmlElementTexture;
    private delegate: VideoDelegate;
    private audioCtx: AudioContext;
    private pluginId: string;

    constructor(private scene: Scene, delegate: VideoDelegate, pluginId: string, audioCtx: AudioContext) {
        console.log(`[VideoWamRenderer] DEBUG: Constructing for plugin ${pluginId}`);
        this.delegate = delegate;
        this.audioCtx = audioCtx;
        this.pluginId = pluginId;
        
        this.canvas = document.createElement("canvas");
        this.canvas.width = 640;
        this.canvas.height = 480;
        this.canvas.id = `wam-video-canvas-${pluginId}`;
        this.canvas.style.position = "fixed";
        this.canvas.style.top = "0";
        this.canvas.style.left = "0";
        this.canvas.style.visibility = "hidden"; 
        this.canvas.style.pointerEvents = "none";
        
        document.body.appendChild(this.canvas);

        console.log(`[VideoWamRenderer] DEBUG: Initializing VideoRenderer (WebGL Context)`);
        this.renderer = new VideoRenderer(this.canvas);
        
        console.log(`[VideoWamRenderer] DEBUG: Connecting video delegate for ${pluginId}`);
        this.delegate.connectVideo({
            width: this.canvas.width,
            height: this.canvas.height,
            gl: this.renderer.gl
        });

        console.log(`[VideoWamRenderer] DEBUG: Creating HtmlElementTexture for ${pluginId}`);
        this.texture = new HtmlElementTexture(`wam-video-texture-${pluginId}`, this.canvas, {
            engine: scene.getEngine(),
            generateMipMaps: false,
            samplingMode: 2 // BILINEAR
        });

        scene.onBeforeRenderObservable.add(this.update);
    }

    private update = () => {
        const time = this.audioCtx.currentTime;
        const inputs = this.delegate.render([], time);
        
        if (inputs && inputs[0]) {
            this.renderer.render(inputs[0]);
            this.texture.update();
        } 
    }

    public getTexture() {
        return this.texture;
    }

    public attachToMesh(mesh: AbstractMesh) {
        console.log(`[VideoWamRenderer] DEBUG: attachToMesh called on ${mesh.name}`);
        const mat = new StandardMaterial(`wam-video-mat-${mesh.name}`, this.scene);
        
        mat.diffuseTexture = this.texture;
        mat.emissiveTexture = this.texture;
        mat.emissiveColor = new Color3(1, 1, 1);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        
        mesh.material = mat;
    }

    public dispose() {
        console.log(`[VideoWamRenderer] DEBUG: Disposing renderer for ${this.pluginId}`);
        this.scene.onBeforeRenderObservable.removeCallback(this.update);
        this.texture.dispose();
        this.canvas.remove();
    }
}
