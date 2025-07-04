import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import { v4 as uuid } from 'uuid';
import {Node3dManager} from "../app/Node3dManager.ts";
import {MenuConfig} from "../shared/SharedTypes.ts";
import {UIManager} from "../app/UIManager.ts";
import {MenuEventBus} from "../eventBus/MenuEventBus.ts";


export class NodeMenu {
    private readonly _menuJson: MenuConfig;

    private _manager: GUI.GUI3DManager;
    private _menu!: GUI.NearMenu;
    public isMenuOpen: boolean = false;

    private readonly eventBus: MenuEventBus = MenuEventBus.getInstance();

    constructor(menuJson: MenuConfig) {
        this._menuJson = menuJson;
        console.log(this._menuJson)
        this._manager = UIManager.getInstance().getGui3DManager()
    }

    private _createMenu(): void {
        this._menu = new GUI.NearMenu("menu");
        this._manager.addControl(this._menu);
        this._menu.margin = 0.5;
        

        const follower: B.FollowBehavior = this._menu.defaultBehavior.followBehavior;
        follower.defaultDistance = 3.5;
        follower.minimumDistance = 3.5;
        follower.maximumDistance = 3.5;

        this._createCategories();

        this.onEvent()
    }

    private _createCategories(): void {
        // sound generators
        const soundGeneratorsButton = new GUI.TouchHolographicButton("soundGenerators");
        soundGeneratorsButton.text = "Sound Generators";
        soundGeneratorsButton.onPointerUpObservable.add((): void => this._createSoundGeneratorsMenu());
        this._menu.addButton(soundGeneratorsButton);

        // wam plugins
        this._menuJson.categories.forEach((category, index: number): void => {
            const button = new GUI.TouchHolographicButton(category.name);
            button.text = category.name;
            button.onPointerUpObservable.add((): void => this._createPluginsMenu(index));
            this._menu.addButton(button);
        });

        // options
        const optionsButton = new GUI.TouchHolographicButton("options");
        optionsButton.text = "Options";
        optionsButton.onPointerUpObservable.add((): void => this._createOptionsMenu());
        this._menu.addButton(optionsButton);
    }

    private _createOptionsMenu(): void {
        this._clearMenu();
        this._createBackButton();
    }

    private _createSoundGeneratorsMenu(): void {
        this._clearMenu();
        this._createBackButton();
        
        // step sequencer
        /* Utiliser PianoRoll de Ayoub
        const stepSequencerButton = new GUI.TouchHolographicButton("stepSequencer");
        stepSequencerButton.text = "Step Sequencer";
        stepSequencerButton.onPointerUpObservable.add((): Promise<void> => this._app.createAudioNode3D("stepSequencer", uuid()));
        this._menu.addButton(stepSequencerButton);

         */
    }

    private _createPluginsMenu(categoryIndex: number): void {
        this._clearMenu();
        this._createBackButton();

        // plugins
        this._menuJson.categories[categoryIndex].plugins.forEach((plugin): void => {
            console.log(plugin.kind)
            const button = new GUI.TouchHolographicButton(plugin.name);
            button.text = plugin.name;
            button.onPointerUpObservable.add(async () => await Node3dManager.getInstance().createAudioNode3D(uuid(), plugin.kind));
            this._menu.addButton(button);
        });
    }

    private _createBackButton(): void {
        const backButton = new GUI.TouchHolographicButton("backButton");
        backButton.text = "Back";
        backButton.imageUrl = "https://cdn.iconscout.com/icon/free/png-256/back-arrow-1767531-1502431.png";
        backButton.onPointerUpObservable.add((): void => {
            this._clearMenu();
            this._createCategories();
        });
        this._menu.addButton(backButton);
    }

    private _clearMenu(): void {
        const children: GUI.Control3D[] = this._menu.children.slice();
        children.forEach((child: GUI.Control3D): void => {
            this._menu.removeControl(child);
        });
    }

    /**
     * Show the menu on the screen
     */
    public show(): void {
        this.isMenuOpen = true;
        this._createMenu();
    }

    /**
     * Hide the menu from the screen
     */
    public hide(): void {
        if (!this._menu) return;
        console.log("hide menu")
        this.isMenuOpen = false;
        this._menu.dispose();
    }

    private onEvent(): void {
        this.eventBus.on('MAIN_MENU_DISABLE', (event): void => {
            if (event.disable) {
                this.hide();
            }
        })
        this.eventBus.on('MAIN_MENU_ENABLE', (event): void => {
            if (event.enable) {
                this.show();
            }
        })
    }

}