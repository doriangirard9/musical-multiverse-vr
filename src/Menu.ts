import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import {MenuConfig} from "./types.ts";
import {App} from "./App.ts";
import { v4 as uuid } from 'uuid';

export class Menu {
    private readonly _app: App = App.getInstance();
    private readonly _menuJson: MenuConfig;

    private _manager: GUI.GUI3DManager;
    private _menu!: GUI.NearMenu;
    public isMenuOpen: boolean = false;

    constructor(menuJson: MenuConfig) {
        this._menuJson = menuJson;
        console.log(this._menuJson)
        this._manager = this._app.guiManager;
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

        // audio outputs
        const audioOutputsButton = new GUI.TouchHolographicButton("audioOutputs");
        audioOutputsButton.text = "Audio Outputs";
        audioOutputsButton.onPointerUpObservable.add((): void => this._createAudioOutputsMenu());
        this._menu.addButton(audioOutputsButton);

        // options
        const optionsButton = new GUI.TouchHolographicButton("options");
        optionsButton.text = "Options";
        optionsButton.onPointerUpObservable.add((): void => this._createOptionsMenu());
        this._menu.addButton(optionsButton);
    }

    private _createAudioOutputsMenu(): void {
        this._clearMenu();
        this._createBackButton();

        // audio output
        const audioOutputButton = new GUI.TouchHolographicButton("audioOutput");
        audioOutputButton.text = "Audio Output";
        audioOutputButton.onPointerUpObservable.add((): Promise<void> => this._app.createAudioNode3D("audioOutput", uuid()));
        this._menu.addButton(audioOutputButton);
    }

    private _createOptionsMenu(): void {
        this._clearMenu();
        this._createBackButton();
    }

    private _createSoundGeneratorsMenu(): void {
        this._clearMenu();
        this._createBackButton();

        // simple oscillator
        const simpleOscillatorButton = new GUI.TouchHolographicButton("simpleOscillator");
        simpleOscillatorButton.text = "Simple Oscillator";
        simpleOscillatorButton.onPointerUpObservable.add((): Promise<void> => this._app.createAudioNode3D("simpleOscillator", uuid()));
        this._menu.addButton(simpleOscillatorButton);

        // step sequencer
        const stepSequencerButton = new GUI.TouchHolographicButton("stepSequencer");
        stepSequencerButton.text = "Step Sequencer";
        stepSequencerButton.onPointerUpObservable.add((): Promise<void> => this._app.createAudioNode3D("stepSequencer", uuid()));
        this._menu.addButton(stepSequencerButton);
    }

    private _createPluginsMenu(categoryIndex: number): void {
        this._clearMenu();
        this._createBackButton();

        // plugins
        this._menuJson.categories[categoryIndex].plugins.forEach((plugin): void => {
            console.log(plugin.configFile)
            const button = new GUI.TouchHolographicButton(plugin.name);
            button.text = plugin.name;
            button.onPointerUpObservable.add((): Promise<void> => this._app.createAudioNode3D(plugin.name, uuid(), plugin.configFile));
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
}