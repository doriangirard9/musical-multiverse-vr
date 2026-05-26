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
    private inputPluginId: string | null = null;
    private inputTexture: WebGLTexture | null = null;

    constructor(private scene: Scene, delegate: VideoDelegate, pluginId: string, audioCtx: AudioContext) {
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

        this.renderer = new VideoRenderer(this.canvas);
        
        this.delegate.connectVideo({
            width: this.canvas.width,
            height: this.canvas.height,
            gl: this.renderer.gl
        });

        this.texture = new HtmlElementTexture(`wam-video-texture-${pluginId}`, this.canvas, {
            engine: scene.getEngine(),
            generateMipMaps: false,
            samplingMode: 2 // BILINEAR
        });

        scene.onBeforeRenderObservable.add(this.update);
    }

    public setInputSource(pluginId: string | null) {
        this.inputPluginId = pluginId;
        if (!pluginId) {
            this.inputTexture = null;
        }
    }

    private update = () => {
        const time = this.audioCtx.currentTime;
        const videoExtension = (window as any).WAMExtensions?.video;
        if (!videoExtension) return;

        const inputs: WebGLTexture[] = [];
        
        // Handle chaining by uploading source canvas into a local texture
        if (this.inputPluginId) {
            const sourceRenderer = videoExtension.getRenderer(this.scene, this.inputPluginId, this.audioCtx);
            if (sourceRenderer && sourceRenderer.getCanvas()) {
                const gl = this.renderer.gl;
                if (!this.inputTexture) {
                    this.inputTexture = gl.createTexture();
                }
                gl.bindTexture(gl.TEXTURE_2D, this.inputTexture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceRenderer.getCanvas());
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                
                if (this.inputTexture) inputs.push(this.inputTexture);
            }
        }

        const outputs = this.delegate.render(inputs, time);
        
        if (outputs && outputs[0]) {
            this.renderer.render(outputs[0]);
            this.texture.update();
        } 
    }

    public getCanvas() {
        return this.canvas;
    }

    public getTexture() {
        return this.texture;
    }

    public attachToMesh(mesh: AbstractMesh) {
        const mat = new StandardMaterial(`wam-video-mat-${mesh.name}`, this.scene);
        mat.diffuseTexture = this.texture;
        mat.emissiveTexture = this.texture;
        mat.emissiveColor = new Color3(1, 1, 1);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mesh.material = mat;
    }

    public dispose() {
        this.scene.onBeforeRenderObservable.removeCallback(this.update);
        this.texture.dispose();
        if (this.inputTexture) this.renderer.gl.deleteTexture(this.inputTexture);
        this.canvas.remove();
    }
}