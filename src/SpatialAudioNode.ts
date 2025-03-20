import * as B from "@babylonjs/core";

export class SpatialAudioNode {
    private audioCtx: AudioContext;
    private pannerNode: PannerNode;
    private mesh: B.Mesh;
    private observer: B.Observer<B.Scene>;

    constructor(audioCtx: AudioContext, mesh: B.Mesh, scene: B.Scene) {
        this.audioCtx = audioCtx;
        this.mesh = mesh;
        this.pannerNode = this.audioCtx.createPanner();

        this.pannerNode.panningModel = "HRTF";
        this.pannerNode.distanceModel = "inverse";
        this.pannerNode.refDistance = 1;
        this.pannerNode.rolloffFactor = 1;
        this.pannerNode.maxDistance = 10000;

        // Important: explicitly update position here
        this.observer = scene.onBeforeRenderObservable.add(() => {
            const pos = this.mesh.getAbsolutePosition();
            this.pannerNode.positionX.setValueAtTime(pos.x, this.audioCtx.currentTime);
            this.pannerNode.positionY.setValueAtTime(pos.y, this.audioCtx.currentTime);
            this.pannerNode.positionZ.setValueAtTime(pos.z, this.audioCtx.currentTime);
        });
    }

    public getAudioNode(): AudioNode {
        return this.pannerNode;
    }

    public connect(destination: AudioNode): void {
        this.pannerNode.connect(destination);
    }

    public disconnect(): void {
        this.pannerNode.disconnect();
    }

    public dispose(scene: B.Scene): void {
        scene.onBeforeRenderObservable.remove(this.observer);
        this.disconnect();
    }
}
