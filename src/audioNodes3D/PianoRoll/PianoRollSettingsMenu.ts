import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";

export class PianoRollSettingsMenu {
    private readonly _manager: GUI.GUI3DManager;
    private _menu: GUI.NearMenu | null = null;
    private readonly _parent: any;

    constructor(scene: B.Scene, parent: any) {
        this._manager = new GUI.GUI3DManager(scene);
        this._parent = parent;

        if (this._manager.utilityLayer) {
            this._manager.utilityLayer.pickingEnabled = true;
            this._manager.utilityLayer.processAllEvents = false;
            this._manager.utilityLayer.onlyCheckPointerDownEvents = true;
            this._manager.utilityLayer.pickUtilitySceneFirst = true;
        }
    }

    public show(): void {
        this.hide();
        console.log("Showing Piano Roll Settings Menu");
        this._menu = new GUI.NearMenu("pianoRollSettings");
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
        this._menu.rows = 2;
        this._menu.columns = 2;
        this._menu.scaling = new B.Vector3(0.7, 0.7, 0.7);

        const bpmButton = new GUI.TouchHolographicButton("bpm");
        bpmButton.text = "BPM";
        bpmButton.onPointerUpObservable.add(() => this._showBpmOptions());
        this._menu.addButton(bpmButton);

        const rowsButton = new GUI.TouchHolographicButton("rows");
        rowsButton.text = "ROWS";
        rowsButton.onPointerUpObservable.add(() => this._showRowsOptions());
        this._menu.addButton(rowsButton);

        const closeButton = new GUI.TouchHolographicButton("close");
        closeButton.text = "Close";
        closeButton.onPointerUpObservable.add(() => this.hide());
        this._menu.addButton(closeButton);
    }

    private _showBpmOptions(): void {
        this._clearMenu();
        if (!this._menu) return;
        this._menu.rows = 1;
        this._menu.columns = 4;

        const bpmOptions = [30, 60, 120, 240];

        bpmOptions.forEach((bpm) => {
            const button = new GUI.TouchHolographicButton(`bpm_${bpm}`);
            button.text = `${bpm} BPM`;
            button.onPointerUpObservable.add(() => {
                this._parent.setTempo(bpm);
                console.log(`BPM set to ${bpm}`);
                this.hide();
            });
            this._menu!.addButton(button);
        });

        const backButton = new GUI.TouchHolographicButton("back");
        backButton.text = "Back";
        backButton.onPointerUpObservable.add(() => this._showMainView());
        this._menu.addButton(backButton);
    }

    private _showRowsOptions(): void {
        this._clearMenu();
        if (!this._menu) return;
        this._menu.rows = 1;
        this._menu.columns = 4;

        const rowOptions = [4, 8, 16, 32];

        rowOptions.forEach((rows) => {
            const button = new GUI.TouchHolographicButton(`rows_${rows}`);
            button.text = `${rows} Rows`;
            button.onPointerUpObservable.add(() => {
                this._parent.setRows(rows);
                console.log(`Rows set to ${rows}`);
                this.hide();
            });
            this._menu!.addButton(button);
        });

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
}
