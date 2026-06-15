
/**
 * Node.js
 */
import CompositeAudioNode from './sdk-parammgr/src/CompositeAudioNode.js';

export default class ISFVideoNode extends CompositeAudioNode {
    _wamNode = undefined;

    setup(wamNode) {
        this._wamNode = wamNode;
        this.connectNodes();
    }

    constructor(context, options) {
        super(context, options);
        this.renderer = null;
        this._analyser = context.createAnalyser();
        this._analyser.fftSize = 512; // Plus précis pour FFT
        this._buffer = new Float32Array(this._analyser.fftSize);
        this._fftBuffer = new Uint8Array(this._analyser.frequencyBinCount);
    }

    connectNodes() {
        this.connect(this._analyser);
    }

    setRenderer(renderer) {
        this.renderer = renderer;
    }

    updateAudioData() {
        if (!this.renderer || !this._analyser) return;
        try {
            this._analyser.getFloatTimeDomainData(this._buffer);
            this._analyser.getByteFrequencyData(this._fftBuffer);
            
            // Calcul du RMS pour compatibilité AUDIO_RMS
            let sum = 0;
            for (let i = 0; i < this._buffer.length; i++) {
                sum += this._buffer[i] * this._buffer[i];
            }
            this.renderer.audioRMS = Math.sqrt(sum / this._buffer.length);
            
            // Passage des buffers bruts pour textures ISF
            this.renderer.audioData = this._buffer;
            this.renderer.fftData = this._fftBuffer;
        } catch (e) {}
    }

    getParamValue(name) { return this._wamNode.getParamValue(name); }
    setParamValue(name, value) { return this._wamNode.setParamValue(name, value); }
    getParamsValues() { return this._wamNode.getParamsValues(); }
    setParamsValues(values) { return this._wamNode.setParamsValues(values); }
}
