
/**
 * index.js - Version Ultra Stable
 */
import WebAudioModule from './sdk/src/WebAudioModule.js';
import ParamMgrFactory from './sdk-parammgr/src/ParamMgrFactory.js';
import ISFVideoNode from './Node.js';
import ISFRenderer from './ISFRenderer.js';
import ISFParser from './ISFParser.js';

export default class ISFVideoPlugin extends WebAudioModule {
    _baseURL = new URL('.', import.meta.url).href;
    _descriptorUrl = `${this._baseURL}descriptor.json`;

    async _loadDescriptor() {
        const response = await fetch(this._descriptorUrl);
        const descriptor = await response.json();
        Object.assign(this.descriptor, descriptor);
    }

    async initialize(state) {
        await this._loadDescriptor();
        this.shaders = [
            'default.fs', 'Standard_Audio.fs', 'Audio_Zoom.fs', 'Audio_Flash.fs',
            'Kaleidoscope.fs', 'Edges.fs', 'Pixelate.fs', 'Ripple.fs', 'Glitch.fs', 'Dots.fs',
            'Chain_Source.fs', 'Damier_Dynamique.fs', 'Simple_Color.fs', 'Gradient.fs'
        ];
        this.currentShaderIndex = 0;
        this.parser = new ISFParser();
        
        // Liste fixe pour WAM (Stabilité), Labels dynamiques pour GUI
        this.standardParamIds = Array.from({length: 15}, (_, i) => `p${i+1}`);
        this.paramsValues = { shaderSelect: 0 };
        this.standardParamIds.forEach(id => this.paramsValues[id] = 0.5);

        return super.initialize(state);
    }

    async getState() {
        return this._audioNode.getState();
    }

    async createAudioNode(initialState) {
        const node = new ISFVideoNode(this.audioContext);
        this._audioNode = node;

        // Configuration FIXE des paramètres WAM pour éviter le bug "already registered"
        const internalParamsConfig = {
            shaderSelect: { defaultValue: 0, minValue: 0, maxValue: this.shaders.length - 1, step: 1, onChange: (v) => this._changeShader(v) }
        };

        // On ajoute les slots génériques
        this.standardParamIds.forEach(id => {
            internalParamsConfig[id] = { defaultValue: 0.5, minValue: 0, maxValue: 1.0, onChange: (v) => this._updateMappedParam(id, v) };
        });

        const paramMgrNode = await ParamMgrFactory.create(this, { internalParamsConfig });
        node.setup(paramMgrNode);

        // Charger le premier shader
        const response = await fetch(`${this._baseURL}shaders/${this.shaders[0]}`);
        this.currentShaderSrc = await response.text();
        this.parser.parse(this.currentShaderSrc);

        if (initialState) node.setState(initialState);
        this.registerVideoExtension(node);
        return node;
    }

    _updateMappedParam(paramId, value) {
        this.paramsValues[paramId] = value;
        if (!this.renderer) return;
        const index = this.standardParamIds.indexOf(paramId);
        const inputs = this.parser.inputs.filter(i => !['image', 'audio', 'audioFFT'].includes(i.TYPE));
        if (inputs[index]) {
            const input = inputs[index];
            if (input.TYPE === 'float' || input.TYPE === 'long') {
                const min = input.MIN !== undefined ? input.MIN : 0;
                const max = input.MAX !== undefined ? input.MAX : 1;
                const realVal = min + (max - min) * value;
                this.renderer.setUniform(input.NAME, realVal);
            } else if (input.TYPE === 'bool' || input.TYPE === 'event') {
                this.renderer.setUniform(input.NAME, value > 0.5);
            } else if (input.TYPE === 'color') {
                // Pour simplifier, on traite le float 0..1 comme une teinte (HSL -> RGB)
                const r = Math.abs(Math.sin(value * 6.28));
                const g = Math.abs(Math.sin(value * 6.28 + 2.1));
                const b = Math.abs(Math.sin(value * 6.28 + 4.2));
                this.renderer.setUniform(input.NAME, [r, g, b, 1.0]);
            }
        }
    }

    async _changeShader(index) {
        const shaderIndex = Math.round(index);
        if (this.currentShaderIndex === shaderIndex && this.renderer) return;
        this.currentShaderIndex = shaderIndex;
        
        const response = await fetch(`${this._baseURL}shaders/${this.shaders[shaderIndex]}`);
        this.currentShaderSrc = await response.text();
        this.parser.parse(this.currentShaderSrc);

        if (this.renderer) {
            this.renderer.loadSource(this.currentShaderSrc);
            // Re-mapper les paramètres actuels
            this.standardParamIds.forEach(id => this._updateMappedParam(id, this.paramsValues[id]));
        }
        this._audioNode.dispatchEvent(new CustomEvent('shader-changed'));
    }

    registerVideoExtension(node) {
        if (window.WAMExtensions && window.WAMExtensions.video) {
            window.WAMExtensions.video.setDelegate(this.instanceId, {
                connectVideo: async (options) => {
                    this.renderer = new ISFRenderer(options.gl);
                    node.setRenderer(this.renderer);
                    this.renderer.loadSource(this.currentShaderSrc);
                    this.standardParamIds.forEach(id => this._updateMappedParam(id, this.paramsValues[id]));
                },
                config: () => ({ numberOfInputs: 1, numberOfOutputs: 1 }),
                render: (inputs, currentTime) => {
                    if (this.renderer) {
                        node.updateAudioData();
                        return [this.renderer.draw(this.renderer.gl.canvas.width, this.renderer.gl.canvas.height, inputs)];
                    }
                    return inputs;
                },
                disconnectVideo: () => { this.renderer = null; node.setRenderer(null); }
            });
        }
    }

    async createGui() {
        const { createElement } = await import('./Gui.js');
        return createElement(this);
    }
}
