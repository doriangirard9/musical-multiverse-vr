import { Color4, Engine, ShaderMaterial, ShaderStore, Vector2, Vector3 } from "@babylonjs/core"
import { ReactiveBlockGround } from "./ReactiveBlockGround"
import { WaveSimulator } from "./WaveSimulator"

ShaderStore.ShadersStore["wave_groundVertexShader"] = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 coord;
    attribute vec3 normal;
    
    #include <instancesDeclaration>
    
    uniform mat4 viewProjection;
    uniform float time;

    out float vWave;
    out vec3 vNormal;

    float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    vec2 fade(vec2 t) {
        return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    }

    float grad(vec2 p, vec2 ip) {
        vec2 g = vec2(
            hash(ip),
            hash(ip + 1.0)
        ) * 2.0 - 1.0;

        return dot(g, p - ip);
    }

    float perlin(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);

        vec2 u = fade(f);

        float n00 = grad(f, i + vec2(0.0, 0.0));
        float n10 = grad(f, i + vec2(1.0, 0.0));
        float n01 = grad(f, i + vec2(0.0, 1.0));
        float n11 = grad(f, i + vec2(1.0, 1.0));

        float nx0 = mix(n00, n10, u.x);
        float nx1 = mix(n01, n11, u.x);

        return mix(nx0, nx1, u.y);
    }

    void main(void)
    {
        #include <instancesVertex>

        vec2 offseted = coord + vec2(time*1., 0.);
        float perlin = (perlin(offseted*.1)+1.)/2.;
        float wave = (sin(perlin+time*4.))/2.+.5;

        vWave = wave;

        vec3 pos = (finalWorld * vec4(position, 1.0)).xyz;
        pos = pos + vec3(0,wave*.4,0); 

        gl_Position = viewProjection * vec4(pos, 1.0);

        vNormal = normal;
    }
`

ShaderStore.ShadersStore["wave_groundFragmentShader"] = `
    precision highp float;

    in float vWave;
    in vec3 vNormal;

    void main(void) {
        float topping = dot(vNormal, vec3(0,1,0))/2.+.5;


        gl_FragColor = vec4(1,0,0,1)*vec4(topping*vWave,topping,topping,1);
    }
`


export class WaveGround {

    private ground: ReactiveBlockGround
    private red_waves: WaveSimulator
    private green_waves: WaveSimulator
    private blue_waves: WaveSimulator

    get root(){ return this.ground.root }

    constructor(
        readonly width: number,
        readonly height: number,
    ){
        const that = this

        const material = new ShaderMaterial("waveGround", Engine.LastCreatedScene!!,
            {
                vertex: "wave_ground",
                fragment: "wave_ground",
            },
            {
                attributes: ["position","coord","normal"],
                uniforms: ["viewProjection","world","time"],
            },
        )

        const o = material.getScene().onBeforeRenderObservable.add(()=>{
            material.setFloat("time", Date.now()/1000%1000)
        })
        material.onDisposeObservable.add(()=>o.remove())

        this.ground = new ReactiveBlockGround(width,height,
            (x,y,block)=>{
                block.scaling.multiplyInPlace(new Vector3(0.95,1,0.95))
                block.receiveShadows = false
                block.checkCollisions = false
                block.isPickable = false
                // block.instancedBuffers.coord = new Vector2(x,y)
            },
            (block)=>{
                //block.material = material
                // block.registerInstancedBuffer("coord", 2)
                // block.instancedBuffers.coord = new Vector2(0,0)
            }
        )

        function setColor(x: number, y: number, red: number, green: number, blue: number){
            const color = new Color4(.2+red*.8, .2+green*.8, .2+blue*.8, 1)
            const height = (red + green + blue)/2
            const block = that.ground.get(x,y)
            if(block) {
                block.instancedBuffers.color = color
                block.scaling.y = 1 + height*2
            }
        }

        for(let x=0; x<width; x++) for(let y=0; y<height; y++) setColor(x,y,0,0,0)

        function updateColor(x: number, y: number){
            const red = that.red_waves.get(x,y)
            const green = that.green_waves.get(x,y)
            const blue = that.blue_waves.get(x,y)
            setColor(x,y,red,green,blue)
        }

        this.red_waves = new WaveSimulator(width, height, (x,y,_)=> updateColor(x,y))
        this.green_waves = new WaveSimulator(width, height, (x,y,_)=> updateColor(x,y))
        this.blue_waves = new WaveSimulator(width, height, (x,y,_)=> updateColor(x,y))
    }

    private i=0
    update(){
        this.i++
        if(this.i % 3 == 0) this.red_waves.update()
        if(this.i % 3 == 1) this.green_waves.update()
        if(this.i % 3 == 2) this.blue_waves.update()
    }

    put(x: number, y: number, red: number, green: number, blue: number){
        this.red_waves.put(x, y, Math.max(this.red_waves.get(x,y), red))
        this.green_waves.put(x, y, Math.max(this.green_waves.get(x,y), green))
        this.blue_waves.put(x, y, Math.max(this.blue_waves.get(x,y), blue))
    }

    putWorldSpace(position: Vector3, red: number, green: number, blue: number){
        const matrix = this.root.getWorldMatrix().clone().invert()
        const local = Vector3.TransformCoordinatesToRef(position, matrix, new Vector3())
        const x = Math.floor((local.x + 0.5)*this.width)+1
        const y = Math.floor((local.z + 0.5)*this.height)+1
        this.put(x,y,red,green,blue)
    }

}