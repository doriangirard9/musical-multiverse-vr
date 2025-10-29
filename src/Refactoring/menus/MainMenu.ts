import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import { v4 as uuid } from 'uuid';
import { AbstractMenu } from "./AbstractMenu.ts";
import {UIManager} from "../app/UIManager.ts";
import {MenuConfig} from "../shared/SharedTypes.ts";

//Images pour les menus ---------------------------
import bigMuffImg from "./img/bigmuff.png"
import distoImg from "./img/distomachine.png"
import fluteImg from "./img/flute.png"
import greyholeImg from "./img/greyhole.png"
import guitarImg from "./img/guitare.jpg"
import kbverbImg from "./img/kbverb.png"
import pianoImg from "./img/piano.png"
import pingPongDelay from "./img/pingpongdelay.png"
import voxampImg from "./img/voxamp.png"
//-------------------------------------------------
export class MainMenu extends AbstractMenu {
    private readonly _menuConfig: MenuConfig;

    constructor(menuConfig: MenuConfig) {
        super("mainMenu", UIManager.getInstance().getGui3DManager());
        this._menuConfig = menuConfig;
    }

    protected _createMenu(): void {
        this._menu = new GUI.NearMenu(this._menuId);
        this._manager.addControl(this._menu);
        this._menu.margin = 0.1;

        const follower: B.FollowBehavior = this._menu.defaultBehavior.followBehavior;
        follower.defaultDistance = 3.5;
        follower.minimumDistance = 3.5;
        follower.maximumDistance = 3.5;

        this._createCategories();
    }

    private _createCategories(): void {
        
        // WAM plugins
        this._menuConfig.categories.forEach((category, index: number): void => {
            const button = new GUI.TouchHolographicButton(category.name);
            button.imageUrl = "https://raw.githubusercontent.com/microsoft/MixedRealityToolkit-Unity/main/Assets/MRTK/SDK/StandardAssets/Textures/IconStar.png"
            button.text = category.name;
            button.onPointerUpObservable.add((): void => this._createPluginsMenu(index));
            this._menu.addButton(button);
        });

        // Options
        const optionsButton = new GUI.TouchHolographicButton("options");
        optionsButton.text = "Options";
        optionsButton.onPointerUpObservable.add((): void => this._createOptionsMenu());
        this._menu.addButton(optionsButton);
    }

    private _createOptionsMenu(): void {
        this._clearMenu();
        this._createBackButton();
        // Add options specific buttons here
    }

    private _createPluginsMenu(categoryIndex: number): void {
        this._clearMenu();
        this._createBackButton();

        // Plugins
        this._menuConfig.categories[categoryIndex].plugins.forEach((plugin): void => {
            const button = new GUI.TouchHolographicButton(plugin.name);
            /**
             * Pas beau, permet d'avoir des images pour les boutons import des img en haut du fichier
             */
            let url;
            switch (plugin.kind) {
                case "wam3d-Big Muff":
                    url = bigMuffImg
                    break;
                case "wam3d-disto_machine":
                    url = distoImg
                    break;
                case "wam3d-flute":
                    url = fluteImg
                    break;
                case "wam3d-Grey Hole":
                    url = greyholeImg
                    break;
                case "wam3d-guitar":
                    url = guitarImg
                    break;
                case "livepiano":
                    url = pianoImg
                    break;
                case "wam3d-voxamp":
                    url = voxampImg
                    break;
                case "wam3d-kverb":
                    url = kbverbImg
                    break;
                case "wam3d-Ping Pong Delay":
                    url = pingPongDelay
                    break;
            }
            button.imageUrl = url || "https://raw.githubusercontent.com/microsoft/MixedRealityToolkit-Unity/main/Assets/MRTK/SDK/StandardAssets/Textures/IconStar.png";
            button.text = plugin.name;
            button.onPointerUpObservable.add(()=> {
                this.menuEventBus.emit("CREATE_AUDIO_NODE", {name : plugin.name, nodeId : uuid(), kind : plugin.kind});
                this.hide()
            });
            this._menu.addButton(button);
            //button.tooltipText = "This effect is the xxxxx \n It can do xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx " // permet d'avoir du text en hover mais crash 1x/2

        });
    }

    protected _handleDefaultBackAction(): void {
        this._clearMenu();
        this._createCategories();
    }

}
