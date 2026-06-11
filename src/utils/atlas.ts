import { DynamicTexture, Material, Scene, StandardMaterial, Texture, Vector4 } from "@babylonjs/core";

export class TextureAtlas{

    private _texture
    private _material
    private x
    private y

    constructor(
        label: string,
        scene: Scene,
        readonly tile: number = 64,
        readonly total: number = 512
    ){
        this._texture = new DynamicTexture(label+" atlas texture", {width:total, height:total}, scene)
        this._texture.hasAlpha = true
        this._texture.getContext().clearRect(0, 0, total, total)
        this.x = 0
        this.y = 0

        this._material = new StandardMaterial(label+" atlas material", scene)
        this._material.diffuseTexture = this._texture
        this._material.alphaMode = Material.MATERIAL_ALPHATEST
    }

    async add(src: string){
        // Draw
        const image = new Image()
        image.src = src
        await image.decode()

        const ctx = this._texture.getContext()
        ctx.drawImage(image, this.x, this.y, this.tile, this.tile)
        this._texture.update(false)

        const rect = new Vector4(
            this.x/this.total,
            (this.y+this.tile)/this.total,
            (this.x+this.tile)/this.total,
            this.y/this.total,
        )
        
        // Step
        this.x += this.tile
        if(this.x >= this.total){
            this.x = 0
            this.y += this.tile
            if(this.y >= this.total){
                throw new Error("TextureAtlas is full")
            }
        }

        return rect
    }

    get atlas(){ return this._texture as Texture }

    get material(){ return this._material }
}