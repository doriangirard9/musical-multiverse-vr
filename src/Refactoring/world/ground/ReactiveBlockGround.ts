import { Color3, CreateBox, InstancedMesh, TransformNode } from "@babylonjs/core";


export class ReactiveBlockGround {

    root
    block
    blocks

    constructor(
        readonly width: number,
        readonly height: number,
        callback: (x: number, y: number, block: InstancedMesh) => void = () => {}
    ){
        this.root = new TransformNode("reactive block group")

        this.block = CreateBox("reactive block", {size:1})
        this.block.registerInstancedBuffer("color", 4)
        this.block.instancedBuffers.color = Color3.White().toColor4(1) 

        this.blocks = Array.from({length: height*width}, () => null as unknown as InstancedMesh)

        const block_width = 1/width
        const block_height = 1/height

        for(let x=0; x<width; x++){
            for(let y=0; y<height; y++){
                const block = this.block.createInstance(`reactive block ${x}-${y}`)
                block.position.copyFromFloats(-.5+(x-.5)*block_width, 0, -.5+(y-.5)*block_height)
                block.scaling.copyFromFloats(block_width, 1, block_height)
                callback(x, y, block)
                this.root.addChild(block)
                this.blocks[x*height+y] = block
            }
        }
        
    }

    get(x: number, y: number){
        if(x<0 || x>=this.width || y<0 || y>=this.height) return null
        return this.blocks[x*this.height+y]
    }

}