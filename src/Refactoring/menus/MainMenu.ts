import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import { v4 as uuid } from 'uuid';
import { AbstractMenu } from "./AbstractMenu.ts";
import {UIManager} from "../app/UIManager.ts";
import {MenuConfig} from "../shared/SharedTypes.ts"; // Assuming App is defined somewhere

export class MainMenu extends AbstractMenu {
    private readonly _menuConfig: MenuConfig;

    constructor(menuConfig: MenuConfig) {
        super("mainMenu", UIManager.getInstance().getGui3DManager());
        this._menuConfig = menuConfig;
    }

    protected _createMenu(): void {
        this._menu = new GUI.NearMenu(this._menuId);
        this._manager.addControl(this._menu);
        this._menu.margin = 0.5;

        const follower: B.FollowBehavior = this._menu.defaultBehavior.followBehavior;
        follower.defaultDistance = 3.5;
        follower.minimumDistance = 3.5;
        follower.maximumDistance = 3.5;

        this._createCategories();
    }

    private _createCategories(): void {
        // Sound generators
        const soundGeneratorsButton = new GUI.TouchHolographicButton("soundGenerators");
        soundGeneratorsButton.text = "Sound Generators";
        this._menu.addButton(soundGeneratorsButton);

        // WAM plugins
        this._menuConfig.categories.forEach((category, index: number): void => {
            const button = new GUI.TouchHolographicButton(category.name);
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
            button.text = plugin.name;
            button.onPointerUpObservable.add(()=> {
                this.menuEventBus.emit("CREATE_AUDIO_NODE", {name : plugin.name, nodeId : uuid(), kind : plugin.kind});
                this.hide()
            });
            this._menu.addButton(button);
        });
    }

    protected _handleDefaultBackAction(): void {
        this._clearMenu();
        this._createCategories();
    }

}
