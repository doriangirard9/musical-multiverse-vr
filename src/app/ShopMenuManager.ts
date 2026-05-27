import { InputManager } from "../xr/inputs/InputManager"
import { SceneManager } from "./SceneManager"
import { Node3dManager } from "./Node3dManager"
import { ShopPanel } from "../world/menu/ShopPanel"


/**
 * Manager responsible of the shop menu.
 */
export class ShopMenuManager {

    // Instance
    static _instance?: ShopMenuManager

    static async initialize(...network: ConstructorParameters<typeof ShopMenuManager>){
        this._instance = await new ShopMenuManager(...network).initialize()
    }

    static getInstance(): ShopMenuManager {
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
        }
        else this.menu.toggle()
    }

    isOpened(){
        return this.menu?.isVisible ?? false
    }

    async initialize(){ return this }


}