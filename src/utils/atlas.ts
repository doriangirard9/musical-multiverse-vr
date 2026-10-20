import { DynamicTexture, Material, Scene, StandardMaterial, Texture, Vector4 } from "@babylonjs/core";

/**
 * A dynamic texture that can be dynamically filled to contains other texture.
 * Useful to optimise the rendering by merging multiple materials as one.
 */
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

    /**
     * Is there no slot left for another texture.
     */
    get isFull(){ return this.y >= this.total }

    async add(src: string){
        if(this.isFull) throw new Error("TextureAtlas is full")

        // Reserve the slot before awaiting, so concurrent calls get distinct slots
        const x = this.x
        const y = this.y
        this.x += this.tile
        if(this.x >= this.total){
            this.x = 0
            this.y += this.tile
        }

        // Draw
        const image = new Image()
        image.src = src
        await image.decode()

        const ctx = this._texture.getContext()
        ctx.drawImage(image, x, y, this.tile, this.tile)
        this._texture.update(false)

        return new Vector4(
            x/this.total,
            (y+this.tile)/this.total,
            (x+this.tile)/this.total,
            y/this.total,
        )
    }

    get atlas(){ return this._texture as Texture }

    get material(){ return this._material }
}

/**
 * Automatic dispatcher for multiple atlases.
 */
export class MultiTextureAtlas{

    private _atlases = [] as TextureAtlas[]

    constructor(
        readonly label: string,
        readonly scene: Scene,
        readonly tile: number = 64,
        readonly total: number = 512
    ){}

    /**
     * Add a texture to the first atlas with a free slot, creating a new atlas when they are all full.
     * @returns The uv rect of the texture and the material of the atlas holding it.
     */
    async add(src: string){
        let atlas = this._atlases.find(it => !it.isFull)
        if(!atlas){
            atlas = new TextureAtlas(`${this.label} ${this._atlases.length}`, this.scene, this.tile, this.total)
            this._atlases.push(atlas)
        }
        const uv = await atlas.add(src)
        return { uv, material: atlas.material, atlas: atlas.atlas }
    }

    get atlases(): readonly TextureAtlas[] { return this._atlases }
}
