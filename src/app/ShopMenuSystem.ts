import { Observable } from "@babylonjs/core"
import { InputManager } from "../xr/inputs/InputManager"
import { SceneManager } from "./SceneManager"
import { Node3dManager } from "./Node3dManager"
import { ShopMenu } from "../menus/ShopMenu"
import { MenuSystem } from "./MenuSystem"


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
    public menu?: ShopMenu
    readonly onOpened = new Observable<void>()
    readonly onItemSelected = new Observable<string>()
    readonly onNavigationSelected = new Observable<{ level: "menu" | "submenu", label: string }>()

    constructor(
        readonly scene: SceneManager,
        readonly inputs: InputManager,
        readonly nodeManager: Node3dManager,
        readonly menus: MenuSystem,
        readonly options: { allowedKinds?: ReadonlySet<string> } = {},
    ){
        InputManager.getInstance().a_button.onDown.add(()=>{
            this.toggle()
        })
    }

    toggle(){
        if(!this.menu){
            this.menu = new ShopMenu(
                this.scene.getScene(),
                SceneManager.getInstance().getUtilityLayer().utilityLayerScene,
                this.options.allowedKinds,
            )
            this.menu.onItemSelected.add(kind => this.onItemSelected.notifyObservers(kind))
            this.menu.onNavigationSelected.add(event => this.onNavigationSelected.notifyObservers(event))
        }

        if(this.menus.current_menu===this.menu) this.menus.close()
        else {
            this.menus.open(this.menu, false)
            this.onOpened.notifyObservers()
        }
    }

    isOpened(){
        return this.menu?.isVisible ?? false
    }

    async initialize(){ return this }


}
