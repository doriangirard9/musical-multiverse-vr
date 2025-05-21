import { Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";

/**
 * An editable tube mesh.
 */
export class DynamicTube {

    private _start = Vector3.Zero()

    private _end = Vector3.Zero()

    private mesh = null as Mesh|null

    private wait_update = false

    private _radius = 0

    private _tesselation = 0

    private _material = null as null|StandardMaterial

    private _enabled = true

    constructor(
        start: Vector3,
        end: Vector3,
        private scene: Scene,
        options:{radius?: number, tessellation?: number, material?: StandardMaterial} = {}
    ){
        this._start.copyFrom(start)
        this._end.copyFrom(end)
        this._radius = options.radius ?? 0.1
        this._tesselation = options.tessellation ?? 8
        this._material = options.material ?? null
    }

    /**
     * Change the start point of the tube.
     */
    set start(value: Vector3){
        this._start.copyFrom(value)
        this.ask_update()
    }

    /**
     * Change the end point of the tube.
     */
    set end(value: Vector3){
        this._end.copyFrom(value)
        this.ask_update()
    }
    
    /**
     * Change the start and end point of the tube.
     */
    set path(value: [Vector3,Vector3]){
        this._start.copyFrom(value[0])
        this._end.copyFrom(value[1])
        this.ask_update()
    }

    /**
     * The radius of the tube.
     */
    set radius(value: number){
        this._radius = value
        this.ask_update()
    }
    
    get radius() { return this._radius }

    /**
     * The tesselation of the tube.
     */
    set tesselation(value: number){
        this._tesselation = value
        this.ask_update()
    }
    
    get tesselation() { return this._tesselation }

    /**
     * The material of the tube.
     */
    set material(value: StandardMaterial|null){
        this._material = value
        if(this.mesh)this.mesh.material = this.material
    }

    get material(){
        return this._material
    }

    /**
     * Is the tube mesh enabled
     */
    set enabled(value: boolean){
        this._enabled = value
        if(this.mesh)this.mesh.setEnabled(value)
    }

    get enabled(){ return this._enabled }

    ask_update(){
        if(!this.wait_update){
            this.wait_update = true
            requestAnimationFrame(()=>{
                this.mesh?.dispose()
                if(this._tesselation>0 && this._radius>0){
                    this.mesh = MeshBuilder.CreateTube("tube", {
                        radius: this._radius,
                        tessellation: this._tesselation,
                        path: [this._start,this._end]
                    }, this.scene)
                    this.mesh.material = this._material
                    this.mesh.setEnabled(this._enabled)
                }
                else this.mesh = null
                this.wait_update = false
            })
        }
    }

    dispose(){
        this.mesh?.dispose()
    }
}