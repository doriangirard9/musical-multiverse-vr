
/**
 * ISFRenderer.js
 * Moteur de rendu WebGL pour shaders ISF.
 */
import ISFParser from './ISFParser.js';

export default class ISFRenderer {
  constructor(gl) {
    this.gl = gl;
    this.parser = new ISFParser();
    this.program = null;
    this.startTime = performance.now();
    this.frameIndex = 0;
    this.audioRMS = 0;
    this.audioGain = 2.0;
    this.audioPulse = 1.0;
    this.cumulativeTime = 0;
    this.lastFrameTime = performance.now();
    
    // Audio Data
    this.audioData = null;
    this.fftData = null;
    this.audioTexture = this._createAudioTexture();
    this.fftTexture = this._createAudioTexture();
    this.dummyTexture = this._createDummyTexture();
    
    // Stockage des valeurs des paramètres
    this.values = new Map();
    
    this.setupBillboard();
  }

  _createAudioTexture() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  _createDummyTexture() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    return tex;
  }

  _updateAudioTextures() {
    const gl = this.gl;
    if (this.audioData) {
        gl.bindTexture(gl.TEXTURE_2D, this.audioTexture);
        const uintData = new Uint8Array(this.audioData.length);
        for(let i=0; i<this.audioData.length; i++) uintData[i] = (this.audioData[i] + 1.0) * 127.5;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, uintData.length, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, uintData);
    }
    if (this.fftData) {
        gl.bindTexture(gl.TEXTURE_2D, this.fftTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, this.fftData.length, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.fftData);
    }
  }

  setupBillboard() {
    const gl = this.gl;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }

  loadSource(fragmentSrc, vertexSrc) {
    this.parser.parse(fragmentSrc, vertexSrc);
    this.compile();
  }

  compile() {
    const gl = this.gl;
    try {
        const vs = this.createShader(gl.VERTEX_SHADER, this.parser.vertexShader);
        const fs = this.createShader(gl.FRAGMENT_SHADER, this.parser.fragmentShader);
        
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program));
        }
        this.program = program;
        this._buildUniformTypeMap();
    } catch (e) {
        console.error("Shader compilation failed:", e);
    }
  }

  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(info);
    }
    return shader;
  }

  setupOutput(width, height) {
    const gl = this.gl;
    this.outputFramebuffer = gl.createFramebuffer();
    this.outputTexture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, this.outputTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.outputTexture, 0);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  setUniform(name, value) {
    this.values.set(name, value);
    if (name === 'audioGain') this.audioGain = value;
    if (name === 'audioPulse') this.audioPulse = value;
  }

  draw(width, height, inputs = []) {
    const gl = this.gl;
    if (!this.program) return null;
    
    if (!this.outputTexture) this.setupOutput(width, height);

    gl.useProgram(this.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.outputFramebuffer);
    gl.viewport(0, 0, width, height);

    // Sommets
    const posAttr = gl.getAttribLocation(this.program, 'isf_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    // Temps réactif à l'audio
    const now = performance.now();
    const dt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    const audioFactor = 1.0 + (this.audioRMS * this.audioGain * this.audioPulse);
    this.cumulativeTime += dt * audioFactor;

    // Uniforms de base
    this._applyUniform('TIME', this.cumulativeTime);
    this._applyUniform('RENDERSIZE', [width, height]);
    this._applyUniform('FRAMEINDEX', this.frameIndex++);
    this._applyUniform('AUDIO_RMS', Math.max(0.0, this.audioRMS));

    // Mise à jour et liaison des textures audio standard ISF
    this._updateAudioTextures();
    let textureUnit = 0;

    // Appliquer les entrées définies dans le shader
    this.parser.inputs.forEach((inp) => {
        if (inp.TYPE === 'image') {
            const inputIndex = this.parser.inputs.filter(i => i.TYPE === 'image').indexOf(inp);
            const texture = inputs[inputIndex] || this.dummyTexture;
            gl.activeTexture(gl.TEXTURE0 + textureUnit);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            this._applyUniform(inp.NAME, textureUnit);
            this._applyUniform(`_${inp.NAME}_imgSize`, [width, height]);
            this._applyUniform(`_${inp.NAME}_imgRect`, [0, 0, 1, 1]);
            this._applyUniform(`_${inp.NAME}_flip`, false);
            textureUnit++;
        } else if (inp.TYPE === 'audio') {
            gl.activeTexture(gl.TEXTURE0 + textureUnit);
            gl.bindTexture(gl.TEXTURE_2D, this.audioTexture);
            this._applyUniform(inp.NAME, textureUnit);
            textureUnit++;
        } else if (inp.TYPE === 'audioFFT') {
            gl.activeTexture(gl.TEXTURE0 + textureUnit);
            gl.bindTexture(gl.TEXTURE_2D, this.fftTexture);
            this._applyUniform(inp.NAME, textureUnit);
            textureUnit++;
        }
    });

    // Appliquer toutes les autres valeurs (float, color, bool...)
    for (const [name, val] of this.values) {
        if (typeof val === 'number' || Array.isArray(val) || typeof val === 'boolean') {
            this._applyUniform(name, val);
        }
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this.outputTexture;
  }

  _applyUniform(name, value) {
    const gl = this.gl;
    const loc = gl.getUniformLocation(this.program, name);
    if (loc === null) return;

    // Use the cached uniform type info to choose the correct gl.uniform* call
    const uniformType = this._uniformTypes ? this._uniformTypes.get(name) : null;

    if (typeof value === 'boolean') {
      gl.uniform1i(loc, value ? 1 : 0);
    } else if (typeof value === 'number') {
      // Check if this uniform is an int/sampler type in the GLSL program
      if (uniformType === gl.INT || uniformType === gl.SAMPLER_2D || 
          uniformType === gl.SAMPLER_CUBE || uniformType === gl.BOOL ||
          uniformType === gl.INT_SAMPLER_2D || uniformType === gl.UNSIGNED_INT_SAMPLER_2D) {
        gl.uniform1i(loc, value);
      } else {
        gl.uniform1f(loc, value);
      }
    } else if (Array.isArray(value)) {
      if (value.length === 2) gl.uniform2fv(loc, value);
      else if (value.length === 3) gl.uniform3fv(loc, value);
      else if (value.length === 4) gl.uniform4fv(loc, value);
    }
  }

  /**
   * Build a map of uniform name → GL type from the compiled program.
   * Called after each successful compile().
   */
  _buildUniformTypeMap() {
    this._uniformTypes = new Map();
    const gl = this.gl;
    if (!this.program) return;
    
    const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(this.program, i);
      if (info) {
        // Strip array suffix (e.g., "foo[0]" → "foo")
        const name = info.name.replace(/\[0\]$/, '');
        this._uniformTypes.set(name, info.type);
      }
    }
  }
}
