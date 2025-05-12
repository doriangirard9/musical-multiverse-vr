import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import {Instrument3D} from "../Instrument3D.ts";

export class ModuleMenu {
    private readonly _manager: GUI.GUI3DManager;
    private _menu: GUI.NearMenu | null = null;
    private readonly _parent: Instrument3D;
  //  private _selectedPatternId: string | undefined;
//    private _isRecording: boolean = false;
    private _parametersList: string[];

    constructor(scene: B.Scene, parent: Instrument3D,parametersList: string[]) {
        this._manager = new GUI.GUI3DManager(scene);
        this._parent = parent;
        this._parametersList = parametersList;
        if (this._manager.utilityLayer) {
            this._manager.utilityLayer.pickingEnabled = true;
            this._manager.utilityLayer.processAllEvents = false;
            this._manager.utilityLayer.onlyCheckPointerDownEvents = true;
            this._manager.utilityLayer.pickUtilitySceneFirst = true;
        }
    }

    public show(): void {
        this.hide();
        this._menu = new GUI.NearMenu("modulationMenu");
        this._manager.addControl(this._menu);
        this._menu.margin = 0.1;

        const follower = this._menu.defaultBehavior.followBehavior;
        follower.defaultDistance = 4.5;
        follower.minimumDistance = 4.5;
        follower.maximumDistance = 4.5;

        this._showMainView();
    }

    private _clearMenu(): void {
        if (!this._menu) return;
        const children = this._menu.children.slice();
        children.forEach((child: GUI.Control3D) => this._menu!.removeControl(child));
    }

    private _showMainView(): void {
        this._clearMenu();
        if (!this._menu) return;

        this._menu.rows = 1;
        this._menu.columns = this._parametersList.length;

        this._parametersList.forEach((category:string, index: number): void => {
            const button = new GUI.TouchHolographicButton(category);
            button.text = category;
            button.onPointerUpObservable.add((): void => this._createModulationMenu(category, index));
            // @ts-ignore
            this._menu.addButton(button);
        });

        const closeButton = new GUI.TouchHolographicButton("close");
        closeButton.text = "Close";
        closeButton.onPointerUpObservable.add(() => this.hide());
        this._menu.addButton(closeButton);
    }

    private _createModulationMenu(category:string, index: number): void {
        this._clearMenu();
        if (!this._menu) return;

        //TODO : Automatiser la création les boutons de modulations
        const oscillateurButton = new GUI.TouchHolographicButton("Oscillateur");
        oscillateurButton.text = "Oscillateur";
        oscillateurButton.onPointerUpObservable.add((): Promise<void> => this._parent.createModule(category, index, "Oscillateur"));
        this._menu.addButton(oscillateurButton);

        const stepSequencerButton = new GUI.TouchHolographicButton("Step Sequencer");
        stepSequencerButton.text = "Step Sequencer";
        stepSequencerButton.onPointerUpObservable.add((): Promise<void> => this._parent.createModule(category, index, "Step Sequencer"));
        this._menu.addButton(stepSequencerButton);


        const backButton = new GUI.TouchHolographicButton("back");
        backButton.text = "Back";
        backButton.onPointerUpObservable.add(() => this._showMainView());
        this._menu.addButton(backButton);
    }


    public hide(): void {
        if (this._menu) {
            this._menu.dispose();
            this._menu = null;
        }
    }




























    /*private readonly _app: App = App.getInstance();

    private _manager: GUI.GUI3DManager;
    private _menu!: GUI.NearMenu;
    public isMenuOpen: boolean = false;
    private _parametersList: string[];
    private _id : string;

    constructor(parametersList: string[],id:string) {
        this._parametersList = parametersList;
        this._manager = this._app.guiManager;
        this._id = id;
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
        this._parametersList.forEach((category:string, index: number): void => {
            const button = new GUI.TouchHolographicButton(category);
            button.text = category;
            button.onPointerUpObservable.add((): void => this._createModulationMenu(category, index));
            this._menu.addButton(button);
        });
    }

    private _createSettingsButton(): void {
        const buttonMesh = B.MeshBuilder.CreateBox('settingsButton', { width: 0.8, height: 0.2, depth: 0.8 }, this._scene);
        buttonMesh.position.set(1.5, 0.35, 2.3);
        buttonMesh.rotation.x = -Math.PI / 4;
        buttonMesh.parent = this.baseMesh;

        const buttonMaterial = new B.StandardMaterial("buttonMaterial", this._scene);
        buttonMaterial.diffuseColor = new B.Color3(0.3, 0.3, 0.3);
        buttonMaterial.emissiveColor = new B.Color3(0.2, 0.2, 0.2);
        buttonMesh.material = buttonMaterial;

        buttonMesh.actionManager = new B.ActionManager(this._scene);
        buttonMesh.actionManager.registerAction(
            new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => this._showSettingsMenu())
        );

        const highlightLayer = new B.HighlightLayer(`hl-settings-${this.id}`, this._scene);
        buttonMesh.actionManager.registerAction(
            new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, () => highlightLayer.addMesh(buttonMesh, B.Color3.Blue()))
        );
        buttonMesh.actionManager.registerAction(
            new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, () => highlightLayer.removeMesh(buttonMesh))
        );
    }

    private _showSettingsMenu(): void {
        this._settingsMenu.show();
    }

    private _createModulationMenu(category:string, index: number): void {
        this._clearMenu();
        this._createBackButton();

        //TODO : Automatiser la création les boutons de modulations
        const oscillateurButton = new GUI.TouchHolographicButton("oscillateur");
        oscillateurButton.text = "Oscillateur";
        oscillateurButton.onPointerUpObservable.add((): Promise<void> => this._app.createModule(category, index, this._id, this, "oscillateur"));
        this._menu.addButton(oscillateurButton);

        const bouncingSphereButton = new GUI.TouchHolographicButton("bouncingSphere");
        bouncingSphereButton.text = "Bouncing Sphere";
        bouncingSphereButton.onPointerUpObservable.add((): Promise<void> => this._app.createModule(category, index, this._id, this, "bouncingSphere"));
        this._menu.addButton(bouncingSphereButton);
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


    public show(): void {
        this.isMenuOpen = true;
        this._createMenu();
    }

    public hide(): void {
        if (!this._menu) return;
        console.log("hide menu")
        this.isMenuOpen = false;
        this._menu.dispose();
    }*/
}