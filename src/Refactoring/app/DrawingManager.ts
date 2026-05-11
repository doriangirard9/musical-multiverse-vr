import { Color3, Color4, CreateBox, Vector3 } from "@babylonjs/core"
import { NetworkManager } from "../network/NetworkManager"
import { Curve3D } from "../world/curve/Curve3D"
import { RandomUtils } from "../node3d/tools/utils/RandomUtils"
import { InputManager } from "../xr/inputs/InputManager"
import { SceneManager } from "./SceneManager"


/**
 * Manager for drawing in the 3D world. It allows users to create and manipulate 3D curves that are synchronized across the network.
 * It uses the Curve3D class to represent individual curves and manages their synchronization using the NetworkManager.
 * It also handles user inputs related to drawing, allowing users to create and modify curves in real-time.
 */
export class DrawingManager {

    // Instance
    static _instance?: DrawingManager

    static async initialize(...network: ConstructorParameters<typeof DrawingManager>){
        this._instance = new DrawingManager(...network)
    }

    static getInstance(): DrawingManager {
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

    create(color: Color4): Curve3D {
        const curve = new Curve3D(color,this.scene.getScene())
        const id = RandomUtils.randomID()
        this.manager.add(id, curve, color.toHexString())
        return curve
    }

    onAdd(instance: Curve3D){
        setTimeout(()=>{
            instance.dispose()
        },1000*60)
    }


    // Controls //
    registerInputs(){
        let curve: Curve3D | undefined
        let last_pos = new Vector3(0,9999,0)
        this.inputs.b_button.setPressInterval(
            100,
            ()=>{
                const pos = this.inputs.right.pointer.origin.clone()
                if(last_pos.subtract(pos).length() > 0.2){
                    if(curve) curve.points = [...curve.points, pos]
                    last_pos.copyFrom(pos)
                }
            },
            ()=>{
                curve = this.create(this.usercolor.toColor4(1))
                last_pos = new Vector3(0,9999,0)
            },
        )
    }


}