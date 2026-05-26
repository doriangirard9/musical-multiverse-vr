class Uniform {
    private location: WebGLUniformLocation;

    constructor(private gl: WebGLRenderingContext | WebGL2RenderingContext, program: WebGLProgram, private name: string, private suffix: string) {
        const loc = gl.getUniformLocation(program, name);
        if (loc === null) {
            throw new Error(`Uniform ${name} not found`);
        }
        this.location = loc;
    }

    set(...values: any[]) {
        const method = ('uniform' + this.suffix) as keyof (WebGLRenderingContext | WebGL2RenderingContext);
        // @ts-ignore
        this.gl[method](this.location, ...values);
    }
}

class Rect {
    public buffer: WebGLBuffer;

    constructor(private gl: WebGLRenderingContext | WebGL2RenderingContext) {
        const buffer = gl.createBuffer();
        if (!buffer) throw new Error("Failed to create buffer");
        this.buffer = buffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        const verts = new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    }

    render() {
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
}

export class VideoRenderer {
    public gl: WebGLRenderingContext | WebGL2RenderingContext;
    private program: WebGLProgram;
    private billboard: Rect;
    private positionLocation: number;

    private uTextureLocation: WebGLUniformLocation | null = null;

    constructor(public canvas: HTMLCanvasElement) {
        const options: WebGLContextAttributes = {
            preserveDrawingBuffer: true,
            alpha: true,
            premultipliedAlpha: false
        };
        const gl = canvas.getContext("webgl2", options) || canvas.getContext("webgl", options);
        if (!gl) throw new Error("WebGL not supported");
        this.gl = gl as WebGLRenderingContext | WebGL2RenderingContext;

        const program = this.gl.createProgram();
        if (!program) throw new Error("Failed to create program");
        this.program = program;

        this.addShader(this.vertexShader(), this.gl.VERTEX_SHADER);
        this.addShader(this.fragmentShader(), this.gl.FRAGMENT_SHADER);

        this.gl.linkProgram(this.program);
        this.gl.useProgram(this.program);

        this.uTextureLocation = this.gl.getUniformLocation(this.program, 'u_texture');
        this.billboard = new Rect(this.gl);
        this.positionLocation = this.gl.getAttribLocation(this.program, 'a_position');

        this.resize();
    }

    render(input: WebGLTexture) {
        this.gl.useProgram(this.program);
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        // Robust state reset
        this.gl.disable(this.gl.DEPTH_TEST);
        this.gl.disable(this.gl.CULL_FACE);
        this.gl.disable(this.gl.BLEND);
        this.gl.disable(this.gl.SCISSOR_TEST);
        this.gl.disable(this.gl.STENCIL_TEST);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, input);
        if (this.uTextureLocation) this.gl.uniform1i(this.uTextureLocation, 0);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.billboard.buffer);
        this.gl.enableVertexAttribArray(this.positionLocation);
        this.gl.vertexAttribPointer(this.positionLocation, 2, this.gl.FLOAT, false, 0, 0);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        this.gl.useProgram(null);
    }

    resize() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        this.gl.viewport(0, 0, width, height);
    }

    private addShader(source: string, type: number) {
        const shader = this.gl.createShader(type);
        if (!shader) throw new Error("Failed to create shader");
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            throw new Error(`Shader compile error: ${this.gl.getShaderInfoLog(shader)}`);
        }
        this.gl.attachShader(this.program, shader);
    }

    private vertexShader() {
        return `
attribute vec2 a_position;
varying vec2 vUV;
void main() {
    vUV = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0, 1);
}
        `;
    }

    private fragmentShader() {
        return `
precision mediump float;
varying vec2 vUV;
uniform sampler2D u_texture;
void main() {
    gl_FragColor = texture2D(u_texture, vUV);
}
        `;
    }
}
