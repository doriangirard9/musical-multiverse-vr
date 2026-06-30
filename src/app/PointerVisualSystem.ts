import { Color3 } from "@babylonjs/core"
import { InputManager } from "../xr/inputs/InputManager"
import { SceneManager } from "./SceneManager"
import { InputVisualPointer, MeshUtils } from "../node3d/tools"
import { PointerInput } from "../xr/inputs"


/**
 * The pointer visual system is responsible for creating and managing the visual representation
 * of pointers in the scene.
 * The pointers are not shared online.
 * The {@link AvatarSystem} is reponsible for creating and managing the visual representation
 * of other players' pointers in the scene.
 */
export class PointerVisualSystem {

    readonly left
    readonly right

    readonly pointerToVisual

    constructor(
        readonly scenes: SceneManager,
        readonly inputs: InputManager,
    ){
        this.left = new PointerVisual(this.inputs.left.pointer, this)
        this.right = new PointerVisual(this.inputs.right.pointer, this)
        this.pointerToVisual = new Map<PointerInput, PointerVisual>([
            [this.inputs.left.pointer, this.left],
            [this.inputs.right.pointer, this.right],
        ])
    }

    // Instance
    static _instance?: PointerVisualSystem

    static async initialize(...network: ConstructorParameters<typeof PointerVisualSystem>){
        this._instance = new PointerVisualSystem(...network)
    }

    static getInstance(): PointerVisualSystem {
        if(!this._instance) throw new Error("PointerVisualSystem not initialized. Call initialize() first.")
        return this._instance
    }


}


/**
 * The visual representation of a pointer. It is created by the PointerVisualSystem and is used to display the pointer in the scene.
 */
export class PointerVisual{

    /**
     * The visual representation of the pointer. It is created by the PointerVisualSystem and is used to display the pointer in the scene.
     */
    visual

    constructor(
        /**
         * The pointer input that this visual represents. It is used to update the visual's position and orientation in the scene.
         */
        public pointer: PointerInput,
        system: PointerVisualSystem,
    ){
        this.visual = InputVisualPointer.CreateSimple(system.scenes.getScene(), pointer)
        this.updateColor()
    }

    // Color
    private colors = [] as Color3[]

    /**
     * Add a color to the visual. The final color will be the average of all added colors.
     * @param color 
     */
    addColor(color: Color3){
        this.colors.push(color)
        this.colors.sort((a,b)=>a.toHexString().localeCompare(b.toHexString()))
        this.updateColor()
    }

    /**
     * Remove a color from the visual. The final color will be the average of all remaining colors.
     * @param color 
     */
    removeColor(color: Color3){
        const index = this.colors.findIndex(c=>c.equals(color))
        if(index!==-1) this.colors.splice(index, 1)
        this.updateColor()
    }

    private updateColor(){
        let color
        if(this.colors.length===0) color = Color3.White().toColor4(1)
        else{
            const result = new Color3()
            for(const color of this.colors) result.addInPlace(color)
            result.scaleInPlace(1/this.colors.length)
            color = result.toColor4(1)
        }
        MeshUtils.setColor(this.visual.line, color)
        MeshUtils.setColor(this.visual.point, color)
    }
}
