import { Color4, Vector3 } from "@babylonjs/core"
import { ReactiveBlockGround } from "./ReactiveBlockGround"
import { WaveSimulator } from "./WaveSimulator"


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

        this.ground = new ReactiveBlockGround(width,height,(_,__,block)=>{
            block.scaling.multiplyInPlace(new Vector3(0.95,1,0.95))
            block.receiveShadows = false
            block.checkCollisions = false
            block.isPickable = false
        })

        function setColor(x: number, y: number, red: number, green: number, blue: number){
            const color = new Color4(.2+red*.8, .2+green*.8, .2+blue*.8, 1)
            const height = (red + green + blue)/2
            const block = that.ground.get(x,y)
            if(block) {
                block.instancedBuffers.color = color
                block.scaling.y = .1 + height/4
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