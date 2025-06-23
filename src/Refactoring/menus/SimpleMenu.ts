import { FollowBehavior, TransformNode } from "@babylonjs/core"
import { GUI3DManager, NearMenu, TouchHolographicButton } from "@babylonjs/gui";


export interface MenuConfig{
    label: string,
    buttons: {
        label: string,
        icon?: TransformNode,
        action: () => void
    }[]
}

/**
 * A simple menu usable in VR.
 * It is a 3D object draggable, connectable, interactable in the 3D space.
 * Each button has a label and an action and can have an 3d icon.
 * Easy to use.
 */
export class SimpleMenu{

    private menu3d: NearMenu
    private buttons: TouchHolographicButton[] = []

    constructor(
        name: string,
        private guiManager: GUI3DManager
    ){
        this.menu3d = new NearMenu(name)
        guiManager.addControl(this.menu3d)
        this.menu3d.margin = 0.5;

        const follower: FollowBehavior = this.menu3d.defaultBehavior.followBehavior
        follower.defaultDistance = 3.5
        follower.minimumDistance = 3.5
        follower.maximumDistance = 3.5
    }

    /**
     * Set the menu configuration.
     * @param config 
     */
    setConfig(config: MenuConfig){
        this.clear()
        for(const button of config.buttons) this.addButton(button)
    }

    /**
     * Add a button to the menu.
     * @param button 
     */
    addButton(button: MenuConfig['buttons'][0]){
        const button3d = new TouchHolographicButton(`${this.menu3d.name}-${button.label}`)
        button3d.text = button.label
        button3d.onPointerUpObservable.add(() => button.action())
        this.menu3d.addButton(button3d)
        this.buttons.push(button3d)
    }

    /**
     * Remove a button from the menu.
     * @param button
     */
    removeButton(index: number){
        const button3d = this.buttons[index]
        if(button3d){
            this.menu3d.removeControl(button3d)
            button3d.dispose()
            this.buttons.splice(index, 1)
        }
    }

    /**
     * Remove all the buttons of the menu.
     */
    clear(){
        while(this.buttons.length > 0) this.removeButton(this.buttons.length-1)
    }

    dispose(){
        this.guiManager.removeControl(this.menu3d)
        this.menu3d.dispose()
    }

}