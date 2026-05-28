import { InputManager } from "../xr/inputs/InputManager"
import { SceneManager } from "./SceneManager"
import { Node3dManager } from "./Node3dManager"
import { ShopPanel } from "../world/menu/ShopPanel"


/**
 * The shop menu. A menu you can open with the 'A' button. It allows the user to add a node3d in the scene.
 */
export class ShopMenuSystem {

    // Instance
    static _instance?: ShopMenuSystem

    static async initialize(...network: ConstructorParameters<typeof ShopMenuSystem>){
        this._instance = await new ShopMenuSystem(...network).initialize()
    }

    static getInstance(): ShopMenuSystem {
        if(!this._instance) throw new Error("ShopMenuManager not initialized. Call initialize() first.")
        return this._instance
    }


    // Menu
    public menu?: ShopPanel

    constructor(
        readonly scene: SceneManager,
        readonly inputs: InputManager,
        readonly nodeManager: Node3dManager,
    ){
        InputManager.getInstance().a_button.onDown.add(()=>{
            this.toggle()
        })
    }

    toggle(){
        if(!this.menu){
            this.menu = new ShopPanel(this.scene.getScene(), SceneManager.getInstance().getUtilityLayer().utilityLayerScene)
            this.menu.followHead()
            this.menu.show()
        }
        else this.menu.toggle()
    }

    isOpened(){
        return this.menu?.isVisible ?? false
    }

    async initialize(){ return this }


}