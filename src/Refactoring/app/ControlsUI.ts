import * as GUI from "@babylonjs/gui";
import * as B from "@babylonjs/core";
import { XRManager } from "../xr/XRManager.ts";
import { SceneManager } from "./SceneManager.ts";

export interface ControlItem {
    id?: string;
    label: string;
    action: () => void;
}

/**
 * ControlsUI — a 3D billboard controls panel that works properly in XR
*/
export class ControlsUI {
    private gui: GUI.AdvancedDynamicTexture | null = null;
    private panel: GUI.StackPanel | null = null;
    private buttons: Map<string, GUI.Button> = new Map();
    private visible: boolean = false;
    private mesh: B.Mesh | null = null;
    private scene: B.Scene;
    private xrManager: XRManager;
    private updateObserver: B.Nullable<B.Observer<B.Scene>> = null;

    constructor(private width: string = "240px"){
        this.scene = SceneManager.getInstance().getScene();
        this.xrManager = XRManager.getInstance();
        this._createMeshAndTexture();
        this.setInstructions([
            "A - Open Menu / Confirm",
            "B - Cancel",
            "X - Hide/Show Controls",
            "Y - Open/Close physical shop",
            "Trigger (hold) - Select object or parameter",
            "Grip : [Free rotation]",
            "Left stick : Move Camera / [Move object away or closer]",
            "Right stick : Move",
            "[instruction] = behaviour while an object is selected"
        ]);
        this.show(); // Show panel by default
    }

    /** Create the 3D mesh with billboard texture for XR compatibility */
    private _createMeshAndTexture(){
        // Create a plane mesh
        this.mesh = B.MeshBuilder.CreatePlane("controlsPanel", { width: 1.2, height: 1.6 }, this.scene);
        this.mesh.billboardMode = B.Mesh.BILLBOARDMODE_ALL; // Always face camera
        this.mesh.isPickable = false;
        
        // Create GUI texture on the mesh
        this.gui = GUI.AdvancedDynamicTexture.CreateForMesh(this.mesh, 1024, 1024);
        
        // Position the mesh
        this._positionMesh();
        
        // Update position each frame when in XR
        this.updateObserver = this.scene.onBeforeRenderObservable.add(() => {
            this._positionMesh();
        });
    }

    /** Position the mesh relative to the camera */
    private _positionMesh(){
        if (!this.mesh) return;
        
        try {
            const camera = this.xrManager.xrHelper?.baseExperience?.camera;
            if (camera) {
                // In XR mode: position relative to XR camera
                const forward = camera.getDirection(B.Vector3.Forward());
                const right = camera.getDirection(B.Vector3.Right());
                const up = camera.getDirection(B.Vector3.Up());
                
                // Position: slightly left, slightly down, and in front
                this.mesh.position = camera.position.clone()
                    .add(forward.scale(1.2))      // 1.2m in front
                    .add(right.scale(-0.2))       // 0.2m to the left
                    .add(up.scale(-0.3));         // 0.3m down
            } else {
                // Fallback for non-XR mode
                const fallbackCamera = this.scene.activeCamera;
                if (fallbackCamera) {
                    const forward = fallbackCamera.getDirection(B.Vector3.Forward());
                    this.mesh.position = fallbackCamera.position.clone().add(forward.scale(3));
                }
            }
        } catch (e) {
            // XR not initialized yet, use default position
            this.mesh.position = new B.Vector3(-0.6, 1.3, 2);
        }
    }

    /** Create the bottom-center panel if not present */
    private _ensurePanel(){
        if(this.panel || !this.gui) return;

        const panel = new GUI.StackPanel();
        panel.width = this.width;
        panel.isVertical = true;
        panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        panel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        panel.paddingLeft = "10px";
        panel.paddingTop = "20px";
        panel.paddingBottom = "20px";
        panel.paddingRight = "10px";
        panel.background = "rgba(0,0,0,0.7)"; // More opaque for better visibility in 3D
        panel.adaptWidthToChildren = true;
        panel.adaptHeightToChildren = true;

        // small header
        const header = new GUI.TextBlock();
        header.text = "Controls";
        header.color = "white";
        header.height = "36px";
        header.fontSize = 18;
        header.paddingBottom = "8px";
        panel.addControl(header);

        this.gui.addControl(panel);
        this.panel = panel;
    }

    /** Add a control button */
    public addControl(item: ControlItem){
        this._ensurePanel();
        const id = item.id ?? `${item.label}-${this.buttons.size+1}`;
        if(this.buttons.has(id)) return;

        const btn = GUI.Button.CreateSimpleButton(id, item.label);
        btn.width = "200px";
        btn.height = "40px";
        btn.color = "white";
        btn.background = "#333333";
        btn.cornerRadius = 6;
        btn.thickness = 0;
        btn.paddingTop = "6px";
        btn.paddingBottom = "6px";
        btn.onPointerUpObservable.add(()=>{
            try{ item.action(); }catch(e){ console.error(e) }
        })

        this.panel!.addControl(btn);
        this.buttons.set(id, btn);
        return id;
    }

    /** Show a static list of instructions (no buttons) */
    public setInstructions(lines: string[]){
        this.clear();
        this._ensurePanel();
        // reduce panel width for text comfort
        this.panel!.width = this.width;
        for(const line of lines){
            const txt = new GUI.TextBlock();
            txt.text = line;
            txt.color = "white";
            txt.fontSize = 18;
            txt.height = "28px";
            txt.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            txt.paddingLeft = "8px";
            txt.paddingRight = "8px";
            txt.textWrapping = true;
            txt.resizeToFit = true;
            this.panel!.addControl(txt);
        }
    }

    public removeControl(id: string){
        const btn = this.buttons.get(id);
        if(!btn || !this.panel) return;
        this.panel.removeControl(btn);
        btn.dispose();
        this.buttons.delete(id);
    }

    public clear(){
        if(!this.panel) return;
        for(const btn of this.buttons.values()){
            this.panel.removeControl(btn);
            btn.dispose();
        }
        this.buttons.clear();
    }

    public show(){
        if(this.visible) return;
        this._ensurePanel();
        if(this.panel) this.panel.isVisible = true;
        if(this.mesh) this.mesh.isVisible = true;
        this.visible = true;
    }

    public hide(){
        if(!this.visible || !this.panel) return;
        this.panel.isVisible = false;
        if(this.mesh) this.mesh.isVisible = false;
        this.visible = false;
    }

    public toggle(){
        if(this.visible) this.hide(); else this.show();
    }

    /** Convenience: set multiple controls at once (clears existing)
     * @param items array of ControlItem
     */
    public setControls(items: ControlItem[]){
        this.clear();
        for(const it of items) this.addControl(it);
    }

    dispose(){
        if(this.panel && this.gui){
            this.clear();
            this.gui.removeControl(this.panel);
            this.panel.dispose();
            this.panel = null;
        }
        if(this.mesh){
            this.mesh.dispose();
            this.mesh = null;
        }
        if(this.gui){
            this.gui.dispose();
            this.gui = null;
        }
        if(this.updateObserver){
            this.scene.onBeforeRenderObservable.remove(this.updateObserver);
            this.updateObserver = null;
        }
        this.visible = false;
    }
}

export default ControlsUI;
