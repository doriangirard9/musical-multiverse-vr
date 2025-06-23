import * as GUI from "@babylonjs/gui";
import {MenuEventBus} from "../eventBus/MenuEventBus.ts";
import {AudioEventBus} from "../eventBus/AudioEventBus.ts";

export abstract class AbstractMenu {
    protected _manager: GUI.GUI3DManager;
    protected _menu!: GUI.NearMenu;
    public isMenuOpen: boolean = false;
    protected readonly audioEventBus: AudioEventBus = AudioEventBus.getInstance();
    protected readonly menuEventBus: MenuEventBus = MenuEventBus.getInstance();
    protected readonly _menuId: string;

    protected constructor(menuId: string, guiManager: GUI.GUI3DManager) {
        this._menuId = menuId;
        this._manager = guiManager;
    }

    /**
     * Creates the menu structure
     */
    protected abstract _createMenu(): void;

    /**
     * Clears all controls from the menu
     */
    protected _clearMenu(): void {
        if (!this._menu) return;

        const children: GUI.Control3D[] = this._menu.children.slice();
        children.forEach((child: GUI.Control3D): void => {
            this._menu.removeControl(child);
        });
    }

    /**
     * Creates a back button for navigation
     * @param onBackAction Custom action to execute when back is pressed
     */
    protected _createBackButton(onBackAction?: () => void): void {
        const backButton = new GUI.TouchHolographicButton("backButton");
        backButton.text = "Back";
        backButton.imageUrl = "https://cdn.iconscout.com/icon/free/png-256/back-arrow-1767531-1502431.png";
        backButton.onPointerUpObservable.add((): void => {
            if (onBackAction) {
                onBackAction();
            } else {
                this._handleDefaultBackAction();
            }
        });
        this._menu.addButton(backButton);
    }

    /**
     * Default back button action, override if needed
     */
    protected _handleDefaultBackAction(): void {
        this._clearMenu();
    }

    /**
     * Initialize menu event listeners
     */
    protected _initializeEvents(): void {
        // Implement in subclasses if needed
    }

    /**
     * Show the menu on the screen
     */
    public show(): void {
        this.isMenuOpen = true;
        this._createMenu();
        this._initializeEvents();
    }

    /**
     * Hide the menu from the screen
     */
    public hide(): void {
        if (!this._menu) return;

        this.isMenuOpen = false;
        this._menu.dispose();
    }
}