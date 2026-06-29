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
            scene: null,
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
            
            if (!this.hasFrames) {
                const gl = this.renderer.gl;
                const pixels = new Uint8Array(4);
                // Read a single pixel from the center of the canvas
                const cx = Math.floor(gl.drawingBufferWidth / 2);
                const cy = Math.floor(gl.drawingBufferHeight / 2);
                gl.readPixels(cx, cy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                
                // Butterchurn outputs various dark/grey noise frames during compilation (e.g. 12,16,17 or 72,85,85).
                // We wait until the center pixel has at least one color channel brighter than 100 (approx 40% brightness).
                // This guarantees we only switch when the actual vibrant shader starts rendering.
                const isValid = pixels[0] > 100 || pixels[1] > 100 || pixels[2] > 100;
                
                if (isValid) {
                    console.log(`[VideoWamRenderer] DEBUG: Valid frame detected! RGB: ${pixels[0]}, ${pixels[1]}, ${pixels[2]}`);
                    this.hasFrames = true;
                }
            }
        } 
    }

    public hasFrames = false;

    public getCanvas() {
        return this.canvas;
    }

    public getTexture() {
        return this.texture;
    }

    public attachToMesh(mesh: AbstractMesh) {
        // Remove stale vertex color data (e.g. set to black by stopVideo)
        // that would otherwise multiply with and zero-out the video texture.
        // useVertexColors lives on AbstractMesh, NOT on StandardMaterial.
        mesh.useVertexColors = false;
        const m = mesh as any;
        if (m.removeVerticesData && m.isVerticesDataPresent && m.isVerticesDataPresent("color")) {
            m.removeVerticesData("color");
        }

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