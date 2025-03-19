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
        this._initPanner();

        // Update position on each frame
        this.observer = scene.onBeforeRenderObservable.add(() => {
            const pos = this.mesh.position;
            this.pannerNode.positionX.value = pos.x;
            this.pannerNode.positionY.value = pos.y;
            this.pannerNode.positionZ.value = pos.z;
        });
    }

    private _initPanner(): void {
        this.pannerNode.panningModel = 'HRTF';
        this.pannerNode.distanceModel = 'inverse';
        this.pannerNode.refDistance = 1;
        this.pannerNode.rolloffFactor = 1;
        this.pannerNode.maxDistance = 1000;
    }

    public connect(destination: AudioNode): void {
        this.pannerNode.connect(destination);
    }

    public disconnect(): void {
        this.pannerNode.disconnect();
    }

    public getAudioNode(): AudioNode {
        return this.pannerNode;
    }

    public dispose(scene: B.Scene): void {
        scene.onBeforeRenderObservable.remove(this.observer);
        this.disconnect();
    }
}
