import { AbstractMenu } from "../menus/AbstractMenu"
import { MessageMenu } from "../menus/MessageMenu"
import { SceneManager } from "./SceneManager"


/**
 * The MenuSystem manages the opening and closing of menus in the application.
 * It keeps track of the currently open menu and ensures that only one menu is open at a time.
 * When a new menu is opened, the previous one is closed. It also handles the automatic disposal of menus when they are closed.
 */
export class MenuSystem {


    // Instance
    static _instance?: MenuSystem

    static async initialize(...network: ConstructorParameters<typeof MenuSystem>){
        this._instance = new MenuSystem(...network)
    }

    static getInstance(): MenuSystem {
        if(!this._instance) throw new Error("MenuSystem not initialized. Call initialize() first.")
        return this._instance
    }


    constructor(
        private scenes: SceneManager,
    ){ }

    private lastMenu?: AbstractMenu
    private headFollowing?: {remove():void}

    get current_menu(){ return this.lastMenu }

    /**
     * Open and show a menu, closing the previous one if it exists.
     * @param new_menu The menu to open and show, or undefined to just close the current one
     * @param auto_dispose Should the menu be automatically disposed when closed (default: true)
     * @returns 
     */
    open(new_menu?: AbstractMenu, auto_dispose: boolean = true){
        if(this.lastMenu==new_menu) return

        if(this.lastMenu){
            this.lastMenu.hide()
        }

        if(new_menu){
            this.lastMenu = new_menu
            this.headFollowing = new_menu.followHead()
            new_menu.show()
            new_menu.onHide.addOnce(() => {
                this.lastMenu = undefined
                this.headFollowing?.remove()
                this.headFollowing = undefined
                if(auto_dispose) new_menu.dispose()
            })
        }
    }
    
    /**
     * Close the current menu, if it exists.
     */
    close(){
        this.open(undefined)
    }

    /**
     * If the given menu is currently open, close it. Otherwise, open it.
     */
    toggle(menu: AbstractMenu, auto_dispose: boolean = true){
        if(this.lastMenu===menu) this.close()
        else this.open(menu, auto_dispose)
    }


    //// Utiliies ////
    showMessage(message: string, color?: string){
        const menu = new MessageMenu(
            this.scenes.getScene(),
            this.scenes.getUtilityLayer().utilityLayerScene,
            message,
            color
        )
        setTimeout(() => {
            if(menu.isVisible) menu.hide()
        }, 600)
        this.open(menu)
    }
    


}

