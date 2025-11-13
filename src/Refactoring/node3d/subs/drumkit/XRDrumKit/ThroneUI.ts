import { Scene, MeshBuilder, AbstractMesh } from "@babylonjs/core";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import * as GUI from "@babylonjs/gui";
import ThroneController from "./ThroneController";

/**
 * ThroneUI - Visual indicators for throne sitting/standing
 * Uses 3D world-space GUI for VR compatibility (no double vision)
 * 
 * Shows:
 * - "Press X to sit" prompt when near throne
 * - Circular progress indicator when holding B to stand up
 */
export class ThroneUI {
    private scene: Scene;
    private throneController: ThroneController;
    
    // 3D GUI plane for VR
    private guiPlane: AbstractMesh | null = null;
    private advancedTexture: GUI.AdvancedDynamicTexture | null = null;
    private sitPrompt: GUI.TextBlock | null = null;
    private standUpIndicator: GUI.Ellipse | null = null;
    private standUpFill: GUI.Ellipse | null = null;
    private standUpText: GUI.TextBlock | null = null;
    
    constructor(scene: Scene, _xr: WebXRDefaultExperience, throneController: ThroneController) {
        this.scene = scene;
        this.throneController = throneController;
        
        console.log("[ThroneUI] Initializing throne UI (3D world-space)...");
        this.createUI();
        this.setupUpdateLoop();
        console.log("[ThroneUI] Throne UI initialized successfully");
    }
    
    /**
     * Create UI elements using 3D world-space GUI
     */
    private createUI(): void {
        console.log("[ThroneUI] Creating 3D UI elements...");
        
        // Create a 3D plane for world-space GUI (VR-friendly)
        this.guiPlane = MeshBuilder.CreatePlane("ThroneUIPlane", { width: 2.0, height: 0.8 }, this.scene);
        this.guiPlane.billboardMode = AbstractMesh.BILLBOARDMODE_ALL; // Always face camera
        this.guiPlane.isPickable = false;
        this.guiPlane.renderingGroupId = 1; // Render on top
        
        // Create GUI texture on the plane (higher resolution for text clarity)
        this.advancedTexture = GUI.AdvancedDynamicTexture.CreateForMesh(this.guiPlane, 2048, 1024);
        
        console.log("[ThroneUI] 3D GUI plane and texture created");
        
        // "Press X to sit" prompt (centered)
        this.sitPrompt = new GUI.TextBlock();
        this.sitPrompt.text = "Press X to sit at drums";
        this.sitPrompt.color = "white";
        this.sitPrompt.fontSize = 80; // Larger for 3D space
        this.sitPrompt.fontFamily = "Arial";
        this.sitPrompt.fontWeight = "bold";
        this.sitPrompt.outlineWidth = 4;
        this.sitPrompt.outlineColor = "black";
        this.sitPrompt.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.sitPrompt.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.sitPrompt.isVisible = false;
        this.advancedTexture.addControl(this.sitPrompt);
        
        console.log("[ThroneUI] Sit prompt created and added");
        
        // Stand-up progress indicator (center of GUI)
        // Outer circle
        this.standUpIndicator = new GUI.Ellipse();
        this.standUpIndicator.width = "150px";
        this.standUpIndicator.height = "150px";
        this.standUpIndicator.color = "white";
        this.standUpIndicator.thickness = 4;
        this.standUpIndicator.background = "rgba(0, 0, 0, 0.5)";
        this.standUpIndicator.isVisible = false;
        this.advancedTexture.addControl(this.standUpIndicator);
        
        // Fill circle (progress)
        this.standUpFill = new GUI.Ellipse();
        this.standUpFill.width = "300px"; // Larger for 3D space
        this.standUpFill.height = "300px";
        this.standUpFill.background = "rgba(76, 175, 80, 0.7)"; // Green
        this.standUpFill.isVisible = false;
        this.advancedTexture.addControl(this.standUpFill);
        
        // Text inside circle
        this.standUpText = new GUI.TextBlock();
        this.standUpText.text = "Hold B\nto stand up";
        this.standUpText.color = "white";
        this.standUpText.fontSize = 60; // Larger for 3D space
        this.standUpText.fontFamily = "Arial";
        this.standUpText.fontWeight = "bold";
        this.standUpText.outlineWidth = 3;
        this.standUpText.outlineColor = "black";
        this.standUpText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.standUpText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.standUpText.isVisible = false;
        this.advancedTexture.addControl(this.standUpText);
        
        console.log("[ThroneUI] All UI elements created");
        
        // Start with plane disabled
        this.guiPlane.setEnabled(false);
    }
    
    /**
     * Setup update loop to refresh UI state
     */
    private setupUpdateLoop(): void {
        this.scene.onBeforeRenderObservable.add(() => {
            this.updateUI();
        });
    }
    
    /**
     * Update UI visibility, position, and content based on throne controller state
     */
    private updateUI(): void {
        const isSitting = this.throneController.getIsSitting();
        const isNearThrone = this.throneController.getIsNearThrone();
        const standUpProgress = this.throneController.getStandUpProgress();
        
        // Position the GUI plane above the throne when needed
        if ((isNearThrone || isSitting) && this.guiPlane) {
            const thronePos = this.throneController.getThronePosition();
            if (thronePos) {
                const targetPos = thronePos.clone();
                targetPos.y += 1.5; // 1.5m above throne
                this.guiPlane.position = targetPos;
                this.guiPlane.setEnabled(true);
            }
        } else if (this.guiPlane) {
            this.guiPlane.setEnabled(false);
        }
        
        // Show "Press X to sit" when near throne and not sitting
        if (this.sitPrompt) {
            const shouldShow = isNearThrone && !isSitting;
            if (this.sitPrompt.isVisible !== shouldShow) {
                this.sitPrompt.isVisible = shouldShow;
                if (shouldShow) {
                    console.log("[ThroneUI] Showing sit prompt");
                } else {
                    console.log("[ThroneUI] Hiding sit prompt");
                }
            }
        }
        
        // Show stand-up indicator when holding B
        const showStandUpIndicator = isSitting && standUpProgress > 0;
        
        if (this.standUpIndicator) {
            this.standUpIndicator.isVisible = showStandUpIndicator;
        }
        
        if (this.standUpFill && this.standUpText) {
            this.standUpFill.isVisible = showStandUpIndicator;
            this.standUpText.isVisible = showStandUpIndicator;
            
            // Update fill size based on progress (0-100%)
            const fillPercent = standUpProgress * 100;
            const fillSize = 140 * standUpProgress; // Scale from 0 to 140px
            this.standUpFill.width = `${fillSize}px`;
            this.standUpFill.height = `${fillSize}px`;
            
            // Update text to show percentage
            this.standUpText.text = `Hold B\n${Math.round(fillPercent)}%`;
        }
    }
    
    /**
     * Dispose UI resources
     */
    public dispose(): void {
        if (this.advancedTexture) {
            this.advancedTexture.dispose();
            this.advancedTexture = null;
        }
    }
}

export default ThroneUI;
