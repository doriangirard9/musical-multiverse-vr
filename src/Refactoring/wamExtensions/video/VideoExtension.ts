import { Scene } from "@babylonjs/core";
import { VideoWamRenderer } from "./VideoWamRenderer";

export type VideoDelegate = {
    connectVideo: (options: { width: number, height: number, gl: WebGLRenderingContext | WebGL2RenderingContext }) => void;
    render: (inputs: WebGLTexture[], currentTime: number) => WebGLTexture[];
}

export class VideoExtension {
    private delegates: Map<string, VideoDelegate> = new Map();
    private renderers: Map<string, VideoWamRenderer> = new Map();

    setDelegate(pluginId: string, delegate?: VideoDelegate) {
        console.log(`[VideoExtension] setDelegate for ${pluginId}`, !!delegate);
        if (delegate) {
            this.delegates.set(pluginId, delegate);
        } else {
            this.delegates.delete(pluginId);
            this.renderers.get(pluginId)?.dispose();
            this.renderers.delete(pluginId);
        }
    }

    getDelegate(pluginId: string): VideoDelegate | undefined {
        return this.delegates.get(pluginId);
    }

    getRenderer(scene: Scene, pluginId: string, audioCtx: AudioContext): VideoWamRenderer | undefined {
        let renderer = this.renderers.get(pluginId);
        if (!renderer) {
            const delegate = this.getDelegate(pluginId);
            if (delegate) {
                renderer = new VideoWamRenderer(scene, delegate, pluginId, audioCtx);
                this.renderers.set(pluginId, renderer);
            }
        }
        return renderer;
    }
}