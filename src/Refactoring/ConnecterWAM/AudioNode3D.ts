import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import {SceneManager} from "../app/SceneManager.ts";
import {UIManager} from "../app/UIManager.ts";
import { Synchronized } from "../network/sync/Synchronized.ts";

export abstract class AudioNode3D implements Synchronized {
    static menuOnScene: boolean = false;
    public static currentMenuInstance: AudioNode3D | null = null;

    protected readonly _scene: B.Scene;
    protected readonly _audioCtx: AudioContext;
    protected readonly _pointerDragBehavior: B.PointerDragBehavior;
    public baseMesh!: B.Mesh;
    public boundingBox! : B.AbstractMesh;

    // Gizmo
    protected _rotationGizmo: B.RotationGizmo;
    protected _utilityLayer: B.UtilityLayerRenderer;

    // Menu
    protected _menu!: GUI.NearMenu;
    public _isMenuOpen: boolean = false;

    protected constructor(audioCtx: AudioContext) {
        this._scene = SceneManager.getInstance().getScene();
        this._audioCtx = audioCtx;
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);
        this._pointerDragBehavior = new B.PointerDragBehavior();

    }

    protected abstract instantiate(): any;

    public abstract getAudioNode(): AudioNode;

    protected _createParameterStand(position: B.Vector3, name: string): B.Mesh {
        const parameterStand: B.Mesh = B.MeshBuilder.CreatePlane(`parameterStand`, { size: 0.8 }, this._scene);
        parameterStand.rotate(B.Axis.X, Math.PI / 2, B.Space.WORLD);
        parameterStand.parent = this.baseMesh;
        parameterStand.position = position;

        parameterStand.material = new B.StandardMaterial('material', this._scene);
        parameterStand.material.zOffset = -1;

        const nameTextPlane: B.Mesh = B.MeshBuilder.CreatePlane(`textPlane`, { size: 1 }, this._scene);
        nameTextPlane.parent = parameterStand;
        nameTextPlane.position.z = -0.01;
        const advancedTexture: GUI.AdvancedDynamicTexture = GUI.AdvancedDynamicTexture.CreateForMesh(nameTextPlane);
        const textBlock = new GUI.TextBlock();
        textBlock.text = name;
        textBlock.fontSize = 90;
        textBlock.top = 350;
        advancedTexture.addControl(textBlock);

        return parameterStand;
    }

    protected _createOptionsMenu(): void {
        this._menu = new GUI.NearMenu(`menu`);
        console.log("options menu = bouton delete ?")
        UIManager.getInstance().getGui3DManager().addControl(this._menu);
        this._menu.margin = 0.05;
        this._menu.isPinned = false;
        this._menu.position = this.boundingBox.getAbsolutePosition().clone();//position.clone();
        this._menu.position.y += 1.5;

        const follower: B.FollowBehavior = this._menu.defaultBehavior.followBehavior;
        follower.defaultDistance = 2;
        follower.minimumDistance = 2;
        follower.maximumDistance = 2;

        // Confirmation button for deletion
        const yesButton = new GUI.TouchHolographicButton("yesButton");
        yesButton.text = "Delete";
        yesButton.onPointerUpObservable.add((): void => {
            //this.delete();
        });
        this._menu.addButton(yesButton);

        const noButton = new GUI.TouchHolographicButton("noButton");
        noButton.text = "Cancel";
        noButton.onPointerUpObservable.add((): void => {
            this._hideMenu();
        });
        this._menu.addButton(noButton);

    }

    public static hideAllMenus(): void {
        // Check if any menu is open and close it
        if (AudioNode3D.menuOnScene) {
            // close stored reference to the menu that is currently open and close it her
            AudioNode3D.currentMenuInstance?._hideMenu();
        }
    }

    public _showMenu(): void {
        // First, hide all menus from the scene
        AudioNode3D.hideAllMenus();

        // Now open the clicked menu
        this._isMenuOpen = true;
        AudioNode3D.menuOnScene = true;
        AudioNode3D.currentMenuInstance = this; // Keep reference to the current menu instance

        this._createOptionsMenu();
    }

    public _hideMenu(): void {
        if (!this._isMenuOpen) {
            return; // If no menu is open, do nothing
        }

        this._isMenuOpen = false;
        AudioNode3D.menuOnScene = false;
        this._hideRotationGizmo();
        if (this._menu) this._menu.dispose();
    }

    protected _showRotationGizmo(): void {
        this._rotationGizmo.attachedMesh = this.baseMesh;
    }

    protected _hideRotationGizmo(): void {
        this._rotationGizmo.attachedMesh = null;
        this._rotationGizmo.onDragStartObservable.clear();
        this._rotationGizmo.onDragEndObservable.clear();
    }


    // State and sync
    public abstract getState(key: string): Promise<any>

    public abstract setState(key: string, value: any): Promise<void>

    public abstract getStateKeys(): Iterable<string>

    public async getCompleteState(): Promise<{[key:string]:any}> {
        const promises = [...this.getStateKeys()] .map(key=>this.getState(key).then(value=>[key,value] as [string,any]))
        const values = await Promise.all(promises)
        const map = Object.fromEntries(values)
        return map
    }

    public markStateChange(key:string){
        this.set_state(key) // Fait le pond avec le nouveau système
    }

    // Nouveau système de sync (SyncManager), se base sur l'ancien comme ça j'ai pas besoin de modifier toutes les sous-classes
    private set_state: (key:string)=>void = ()=>{}

    async initSync(_: string, set_state: (key: string) => void): Promise<void> {
        this.set_state = set_state
    }

    disposeSync(): void { this.set_state = ()=>{} }

    askStates(): void { for(const key of this.getStateKeys())this.set_state(key) }

    async removeState(_: string) { }


    public setPosition(position: B.Vector3, rotation: B.Vector3): void {
        this.boundingBox.position = position;
        this.boundingBox.rotation = rotation;
    }

}