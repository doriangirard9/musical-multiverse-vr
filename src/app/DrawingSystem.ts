import { Color3, int, Vector2, Vector3 } from "@babylonjs/core"
import { NetworkManager } from "../network/NetworkManager"
import { Curve3D } from "../world/curve/Curve3D"
import { RandomUtils } from "../node3d/tools/utils/RandomUtils"
import { InputManager } from "../xr/inputs/InputManager"
import { SceneManager } from "./SceneManager"


/**
 * The 3D drawing functionnality. It allows to draw with the controllers in the scene.
 * Manager for drawing in the 3D world.
 * It allows users to create and manipulate 3D curves that are synchronized across the network.
 * It uses the Curve3D class to represent individual curves and manages their synchronization using the NetworkManager.
 * It also handles user inputs related to drawing, allowing users to create and modify curves in real-time.
 */
export class DrawingSystem {

    // Public API //

    /** Add a drawing to the world. **/
    public draw(points: Vector3[], color: Color3 = this.usercolor){
        const curve = new Curve3D(color,this.scene.getScene())
        curve.points = points
        const id = RandomUtils.randomID()
        this.manager.add(id, curve, color.toHexString())
    }

    /** Add a drawing to the world from an SVG path. The SVG path should be a single continuous path. **/
    public drawFromSvg(
        svg: string,
        resolution: int,
        center: Vector3,
        up: Vector3,
        right: Vector3,
        color: Color3 = this.usercolor
    ){
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
        path.setAttribute("d", svg)

        // Get the points
        const points = [] as Vector2[]
        const total_length = path.getTotalLength()
        for(let i=0; i<resolution; i++){
            const point = path.getPointAtLength(i/(resolution-1)*total_length)
            points.push(new Vector2(point.x, point.y))
        }

        // Get data
        const min_x = Math.min(...points.map(p=>p.x))
        const max_x = Math.max(...points.map(p=>p.x))
        const min_y = Math.min(...points.map(p=>p.y))
        const max_y = Math.max(...points.map(p=>p.y))
        const size_x = max_x - min_x
        const size_y = max_y - min_y
        const max_size = Math.max(size_x, size_y)

        // Create curve
        const points3D = points.map(p=>{
            const x = (p.x - min_x - max_size/2)/max_size
            const y = -(p.y - min_y - max_size/2)/max_size
            return right.scale(x).add(up.scale(y)).add(center)
        })

        this.draw(points3D, color)
    }

    // Instance
    static _instance?: DrawingSystem

    static async initialize(...network: ConstructorParameters<typeof DrawingSystem>){
        this._instance = new DrawingSystem(...network)
    }

    static getInstance(): DrawingSystem {
        if(!this._instance) throw new Error("DrawingManager not initialized. Call initialize() first.")
        return this._instance
    }


    // Drawing
    readonly manager

    constructor(
        readonly network: NetworkManager,
        readonly inputs: InputManager,
        readonly scene: SceneManager,
        readonly usercolor: Color3,
    ){
        this.manager = Curve3D.getSyncManager(network.doc,scene.getScene(), this.onAdd.bind(this))
        this.registerInputs()
    }

    private create(color: Color3): Curve3D {
        const curve = new Curve3D(color,this.scene.getScene())
        const id = RandomUtils.randomID()
        this.manager.add(id, curve, color.toHexString())
        return curve
    }

    private onAdd(instance: Curve3D){
        setTimeout(()=>{
            instance.dispose()
        },1000*60)
    }


    // Controls //
    private registerInputs(){
        let curve: Curve3D | undefined
        let last_pos = new Vector3(0,9999,0)
        this.inputs.b_button.setPressInterval(
            100,
            ()=>{
                const pos = this.inputs.right.pointer.origin.clone()
                if(last_pos.subtract(pos).length() > 0.05){
                    if(curve) curve.points = [...curve.points, pos]
                    last_pos.copyFrom(pos)
                }
            },
            ()=>{
                curve = this.create(this.usercolor)
                last_pos = new Vector3(0,9999,0)
            },
        )
    }


}