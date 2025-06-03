import { UIManager } from "../../../app/UIManager";
import { MenuConfig, SimpleMenu } from "../../../menus/SimpleMenu";


/**
 * Manage the menu of an individual node3D instance.
 */
export class N3DMenuInstance {

    private menu?: SimpleMenu
    
    constructor(readonly manager: N3DMenuManager){}

    /**
     * Open a new menu and close the previous one.
     * @param label 
     * @param choices 
     */
    openMenu(label: string, choices: MenuConfig['buttons']){
        this.manager.activeInstance?.closeMenu()
        
        const menu = this.menu = new SimpleMenu(`${label} menu`, this.manager.uiManager.getGui3DManager())
        menu.setConfig({ label: `Menu of ${label}`, buttons: choices })
    }

    /**
     * Close the previously opened menu.
     */
    closeMenu(){
        if(this.menu){
            this.menu?.dispose()
            this.manager.activeInstance = undefined
        }
    }

    /**
     * @returns is a menu opened
     */
    isMenuOpened(){
        return !!this.menu
    }

    /**
     * Show a message
     */
    print(message: string){
        this.manager.uiManager.showMessage(message,3000)
    }

    dispose(){
        this.closeMenu()
    }
}



/**
 * Manage the opening and the closing of all menus, and the print of messages.
 */
export class N3DMenuManager{

    activeInstance?: N3DMenuInstance

    constructor(readonly uiManager: UIManager){}

    createInstance(){
        return new N3DMenuInstance(this)
    }

    dispose(){
        this.activeInstance?.dispose()
    }
}