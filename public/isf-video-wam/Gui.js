
/**
 * Gui.js - Version Définitive (Stable & Fluide)
 */
import './utils/webaudio-controls.js';

export default class ISFVideoGui extends HTMLElement {
    constructor(plugin) {
        super();
        this.plugin = plugin;
        this.attachShadow({ mode: 'open' });
        this._rebuildBound = this.rebuild.bind(this);
    }

    connectedCallback() {
        this.plugin.audioNode.addEventListener('shader-changed', this._rebuildBound);
        this.rebuild();
    }

    disconnectedCallback() {
        this.plugin.audioNode.removeEventListener('shader-changed', this._rebuildBound);
        if (this._raf) cancelAnimationFrame(this._raf);
    }

    rebuild() {
        this.render();
        this.initControls();
        this._updateLoop();
    }

    _updateLoop = async () => {
        if (!this.isConnected) return;
        try {
            const values = await this.plugin.audioNode.getParamsValues();
            
            // Menu
            const select = this.shadowRoot.getElementById('shaderSelect');
            if (select && document.activeElement !== select) {
                const val = Math.round(values.shaderSelect.value !== undefined ? values.shaderSelect.value : values.shaderSelect);
                if (select.value != val) select.value = val;
            }

            // Boutons p1..p15
            const inputs = this.plugin.parser.inputs.filter(i => i.TYPE !== 'image');
            inputs.forEach((input, index) => {
                const paramId = (index < 15) ? this.plugin.standardParamIds[index] : null;
                const el = this.shadowRoot.getElementById(paramId);
                if (el && values[paramId] && !el.drag) {
                    const min = input.MIN !== undefined ? input.MIN : 0;
                    const max = input.MAX !== undefined ? input.MAX : 1;
                    const normalizedValue = values[paramId].value !== undefined ? values[paramId].value : values[paramId];
                    el.value = min + (max - min) * normalizedValue;
                }
            });
        } catch (e) {}
        this._raf = requestAnimationFrame(this._updateLoop);
    }

    render() {
        const shaderOptions = this.plugin.shaders.map((s, i) => 
            `<option value="${i}" ${i === this.plugin.currentShaderIndex ? 'selected' : ''}>${s.replace('.fs', '')}</option>`
        ).join('');

        let dynamicControlsHTML = '';
        const inputs = this.plugin.parser.inputs.filter(i => i.TYPE !== 'image');
        inputs.forEach((input, index) => {
            const paramId = (index < 15) ? this.plugin.standardParamIds[index] : null;
            if (paramId) {
                const min = input.MIN !== undefined ? input.MIN : 0;
                const max = input.MAX !== undefined ? input.MAX : 1;
                const def = input.DEFAULT !== undefined ? (Array.isArray(input.DEFAULT) ? input.DEFAULT[0] : input.DEFAULT) : 0.5;
                dynamicControlsHTML += `
                    <div class="control">
                        <label>${input.NAME}</label>
                        <webaudio-knob id="${paramId}" min="${min}" max="${max}" step="0.01" value="${def}" diameter="35"></webaudio-knob>
                    </div>`;
            }
        });

        this.shadowRoot.innerHTML = `
            <style>
                :host { display: flex; flex-direction: column; background: #1a1a1a; color: #ddd; padding: 15px; border-radius: 12px; font-family: sans-serif; width: 320px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); border: 1px solid #333; max-height: 550px; overflow-y: auto; }
                h3 { margin: 0 0 15px 0; font-size: 16px; text-align: center; color: #007bff; text-transform: uppercase; }
                select { width: 100%; background: #252525; color: #007bff; border: 1px solid #333; padding: 8px; border-radius: 5px; margin-bottom: 15px; cursor: pointer; font-weight: bold; outline: none; }
                .section-title { font-size: 10px; color: #555; margin-bottom: 10px; border-bottom: 1px solid #333; padding-bottom: 3px; text-transform: uppercase; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
                .control { display: flex; flex-direction: column; align-items: center; }
                label { font-size: 9px; margin-bottom: 5px; text-transform: uppercase; color: #888; font-weight: bold; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
            </style>
            <h3>ISF FX SUITE</h3>
            <select id="shaderSelect">${shaderOptions}</select>
            <div class="section-title">Shader Parameters</div>
            <div class="grid">${dynamicControlsHTML}</div>
        `;
    }

    initControls() {
        const select = this.shadowRoot.getElementById('shaderSelect');
        if (select) {
            select.addEventListener('change', (e) => {
                this.plugin.audioNode.setParamsValues({ shaderSelect: parseInt(e.target.value) });
            });
        }

        const paramIds = [...this.plugin.standardParamIds];
        paramIds.forEach(id => {
            const el = this.shadowRoot.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    let val = parseFloat(e.target.value);
                    if (id.startsWith('p')) {
                        const min = parseFloat(e.target.min);
                        const max = parseFloat(e.target.max);
                        val = (val - min) / (max - min || 1);
                    }
                    this.plugin.audioNode.setParamsValues({ [id]: val });
                });
            }
        });
    }
}
customElements.get('isf-video-gui') || customElements.define('isf-video-gui', ISFVideoGui);
export async function createElement(plugin) { return new ISFVideoGui(plugin); }
