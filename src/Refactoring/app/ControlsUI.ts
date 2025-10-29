import * as GUI from "@babylonjs/gui";
import * as B from "@babylonjs/core";
import { XRManager } from "../xr/XRManager.ts";
import { SceneManager } from "./SceneManager.ts";

interface ButtonLabel {
    mesh: B.Mesh;
    gui: GUI.AdvancedDynamicTexture;
    componentId: string; // ID du composant WebXR (ex: "xr-standard-thumbstick", "a-button")
    handedness: 'left' | 'right';
    offset: B.Vector3; // Petit offset pour ne pas être exactement sur le bouton
}

/**
 * ControlsUI — Individual 3D labels positioned near each physical button on controllers
*/
export class ControlsUI {
    private static readonly DEBUG_LOG = false; // Set to true to enable debug logging
    
    private labels: Map<string, ButtonLabel> = new Map();
    private visible: boolean = false;
    private scene: B.Scene;
    private xrManager: XRManager;
    private updateObserver: B.Nullable<B.Observer<B.Scene>> = null;
    private hasLoggedUpdate: boolean = false;
    private debugGrids: Map<string, B.TransformNode> = new Map();
    private showDebugGrid: boolean = false; // Set to false to hide debug grid
    private loggedMeshFinds: Set<string> = new Set(); // Track which meshes we've logged

    constructor(){
        this.scene = SceneManager.getInstance().getScene();
        this.xrManager = XRManager.getInstance();
        this._createLabels();
        this._createDebugGrids();
        
        if (ControlsUI.DEBUG_LOG) console.log(`[ControlsUI] Created ${this.labels.size} labels`);
        
        // Update positions each frame when in XR
        this.updateObserver = this.scene.onBeforeRenderObservable.add(() => {
            this._updateLabelPositions();
            this._updateDebugGrids();
        });
        
        this.show(); // Show labels by default
    }

    /** Create individual labels for each button */
    private _createLabels(){
        // LEFT CONTROLLER LABELS
        this._createLabel("left-Y", "WAM 3D Shop", "left", "y-button", new B.Vector3(0.005, 0.025, 0.005), "#FFC107");
        this._createLabel("left-X", "Hide/Show", "left", "x-button", new B.Vector3(-0.005, 0.015, 0), "#9C27B0");
        this._createLabel("left-Grip", "[Rotate selection]", "left", "xr-standard-squeeze", new B.Vector3(0.025, 0, 0), "#4CAF50");
        this._createLabel("left-Trigger", "Select (Hold)", "left", "xr-standard-trigger", new B.Vector3(0, -0.015, 0.03), "#2196F3");
        this._createLabel("left-Stick", "Move", "left", "xr-standard-thumbstick", new B.Vector3(0, 0.025, 0.015), "#4CAF50");
        
        // RIGHT CONTROLLER LABELS
        //this._createLabel("right-B", "Close", "right", "b-button", new B.Vector3(-0.005, 0.025, 0.005), "#F44336");
        this._createLabel("right-A", "Menu/OK", "right", "a-button", new B.Vector3(0.005, 0.015, 0), "#4CAF50");
        this._createLabel("right-Grip", "[Rotate selection]", "right", "xr-standard-squeeze", new B.Vector3(-0.025, 0, 0), "#4CAF50");
        this._createLabel("right-Trigger", "Select (Hold)", "right", "xr-standard-trigger", new B.Vector3(0, -0.015, 0.03), "#2196F3");
        this._createLabel("right-Stick", "Camera/[Proximity]", "right", "xr-standard-thumbstick", new B.Vector3(0, 0.025, 0.015), "#2196F3");
    }

    /** Create a single label */
    private _createLabel(id: string, text: string, handedness: 'left' | 'right', componentId: string, offset: B.Vector3, color: string = "#FFFFFF"){
        // Create a small plane
        const mesh = B.MeshBuilder.CreatePlane(id, { width: 0.06, height: 0.015 }, this.scene);
        mesh.billboardMode = B.Mesh.BILLBOARDMODE_ALL; // Always face camera
        mesh.isPickable = false;
        mesh.renderingGroupId = 1; // Render in a higher group than default (0)
        mesh.alphaIndex = 1000; // High alpha index to render on top
        
        // Create GUI texture
        const gui = GUI.AdvancedDynamicTexture.CreateForMesh(mesh, 256, 64);
        
        // Create text block with background
        const background = new GUI.Rectangle();
        background.width = 1;
        background.height = 1;
        background.background = "rgba(0, 0, 0, 0.7)";
        background.cornerRadius = 4;
        background.thickness = 1;
        background.color = color;
        gui.addControl(background);
        
        // Create a stack panel to hold title and text vertically
        const stackPanel = new GUI.StackPanel();
        stackPanel.width = 1;
        stackPanel.height = 1;
        stackPanel.spacing = -12; // Reduce spacing between title and text
        background.addControl(stackPanel);
        
        // Get button name from component ID
        const buttonName = this._getButtonName(componentId);
        
        // Create title (button name)
        const titleBlock = new GUI.TextBlock();
        titleBlock.text = buttonName;
        titleBlock.color = "#AAAAAA"; // Gray color
        titleBlock.fontSize = 16;
        titleBlock.height = "24px";
        titleBlock.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        stackPanel.addControl(titleBlock);
        
        // Create main text (action description)
        const textBlock = new GUI.TextBlock();
        textBlock.text = text;
        textBlock.color = "white";
        textBlock.fontSize = 24;
        textBlock.fontWeight = "bold";
        textBlock.height = "50px";
        textBlock.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        stackPanel.addControl(textBlock);
        
        this.labels.set(id, { mesh, gui, componentId, handedness, offset });
    }
    
    /** Get human-readable button name from component ID */
    private _getButtonName(componentId: string): string {
        switch (componentId) {
            case 'a-button': return 'A Button';
            case 'b-button': return 'B Button';
            case 'x-button': return 'X Button';
            case 'y-button': return 'Y Button';
            case 'xr-standard-squeeze': return 'Grip';
            case 'xr-standard-trigger': return 'Trigger';
            case 'xr-standard-thumbstick': return 'Thumbstick';
            default: return componentId;
        }
    }

    /** Update positions of all labels based on controller component positions */
    private _updateLabelPositions(){
        if (!this.visible) return;
        
        try {
            const xrInput = this.xrManager.xrHelper?.input;
            if (!xrInput) return;
            
            let updatedCount = 0;
            for (const [, label] of this.labels.entries()) {
                const controller = xrInput.controllers.find(c => c.inputSource.handedness === label.handedness);
                if (!controller?.grip) continue;
                
                // Try to find the actual component mesh in the controller hierarchy
                const componentMesh = this._findComponentMesh(controller.grip, label.componentId);
                
                // Debug log when we find (or don't find) a mesh
                if (ControlsUI.DEBUG_LOG) {
                    const logKey = `${label.handedness}-${label.componentId}`;
                    if (!this.loggedMeshFinds.has(logKey)) {
                        if (componentMesh) {
                            const meshPos = componentMesh.getAbsolutePosition();
                            console.log(`[ControlsUI] ✓ Found mesh for ${label.componentId} on ${label.handedness}: ${componentMesh.name} at (${meshPos.x.toFixed(3)}, ${meshPos.y.toFixed(3)}, ${meshPos.z.toFixed(3)})`);
                        } else {
                            console.warn(`[ControlsUI] ✗ Could not find mesh for ${label.componentId} on ${label.handedness}`);
                        }
                        this.loggedMeshFinds.add(logKey);
                    }
                }
                
                if (componentMesh) {
                    // Use the bounding box center for the actual physical button position!
                    componentMesh.computeWorldMatrix(true);
                    const boundingInfo = componentMesh.getBoundingInfo();
                    const boundingCenter = boundingInfo.boundingBox.centerWorld;
                    
                    // Apply a small offset above the button
                    const gripRotation = controller.grip.rotationQuaternion || B.Quaternion.Identity();
                    const rotatedLabelOffset = label.offset.clone().applyRotationQuaternion(gripRotation);
                    const finalPos = boundingCenter.add(rotatedLabelOffset);
                    label.mesh.position = finalPos;
                    
                    // Log final label position once
                    if (ControlsUI.DEBUG_LOG) {
                        const posLogKey = `pos-${label.handedness}-${label.componentId}`;
                        if (!this.loggedMeshFinds.has(posLogKey)) {
                            console.log(`[ControlsUI] ${label.componentId} bounding center: (${boundingCenter.x.toFixed(3)}, ${boundingCenter.y.toFixed(3)}, ${boundingCenter.z.toFixed(3)})`);
                            console.log(`[ControlsUI] Label positioned at: (${finalPos.x.toFixed(3)}, ${finalPos.y.toFixed(3)}, ${finalPos.z.toFixed(3)})`);
                            this.loggedMeshFinds.add(posLogKey);
                        }
                    }
                } else {
                    // Fallback to grip position if component not found
                    label.mesh.position = controller.grip.getAbsolutePosition();
                }
                
                updatedCount++;
            }
            
            // Debug log once when we first start updating positions
            if (ControlsUI.DEBUG_LOG && updatedCount > 0 && !this.hasLoggedUpdate) {
                console.log(`[ControlsUI] Updating ${updatedCount} label positions`);
                this.hasLoggedUpdate = true;
            }
        } catch (e) {
            console.error('[ControlsUI] Error updating label positions:', e);
        }
    }

    /**
     * Find component mesh in controller hierarchy
     * Searches for meshes like "b-button", "squeeze", "trigger", "thumbstick", etc.
     * Works for any controller type (Quest, Vive, Index, etc.)
     */
    private _findComponentMesh(gripNode: B.TransformNode, componentId: string): B.AbstractMesh | null {
        // Map WebXR component IDs to actual mesh name patterns
        const meshPatterns = this._getComponentMeshPatterns(componentId);
        
        // Debug: List all nodes in hierarchy once (only after model loads)
        if (ControlsUI.DEBUG_LOG) {
            const logKey = `hierarchy-${gripNode.name}`;
            if (!this.loggedMeshFinds.has(logKey)) {
                const children = gripNode.getChildren();
                // Only log if the controller model has loaded (has children)
                if (children && children.length > 0) {
                    console.log(`[ControlsUI] Full hierarchy of: ${gripNode.name}`);
                    this._listHierarchy(gripNode, 0);
                    this.loggedMeshFinds.add(logKey);
                }
            }
        }
        
        // Recursively search through the controller hierarchy
        const search = (node: B.Node): B.AbstractMesh | null => {
            const nodeName = node.name.toLowerCase();
            
            // Check if this node matches any pattern
            for (const pattern of meshPatterns) {
                if (nodeName.includes(pattern)) {
                    // Skip animation/state nodes - we want the actual visual mesh
                    if (nodeName.includes('pressed') || nodeName.includes('axis') || 
                        nodeName.includes('min') || nodeName.includes('max') || 
                        nodeName.includes('value')) {
                        continue;
                    }
                    
                    // Found a potential mesh - log it once with position
                    if (ControlsUI.DEBUG_LOG) {
                        const meshLogKey = `found-${componentId}-${node.name}`;
                        if (!this.loggedMeshFinds.has(meshLogKey)) {
                            if (node instanceof B.AbstractMesh) {
                                const pos = node.absolutePosition;
                                console.log(`[ControlsUI] ✓ Found ${componentId} mesh: '${node.name}' at (${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)})`);
                            } else {
                                console.log(`[ControlsUI] ✓ Found ${componentId} mesh: '${node.name}' (TransformNode)`);
                            }
                            this.loggedMeshFinds.add(meshLogKey);
                        }
                    }
                    
                    // Found it! Return as AbstractMesh if possible
                    if (node instanceof B.AbstractMesh) {
                        return node;
                    }
                    // If it's a TransformNode, try to find a mesh child
                    if (node instanceof B.TransformNode) {
                        const children = node.getChildren();
                        for (const child of children) {
                            if (child instanceof B.AbstractMesh) {
                                return child;
                            }
                        }
                    }
                }
            }
            
            // Search children recursively
            const children = node.getChildren ? node.getChildren() : [];
            for (const child of children) {
                const result = search(child);
                if (result) return result;
            }
            
            return null;
        };
        
        return search(gripNode);
    }

    /** List all nodes in hierarchy for debugging */
    private _listHierarchy(node: B.Node, depth: number = 0) {
        const indent = '  '.repeat(depth);
        const nodeType = node instanceof B.AbstractMesh ? 'Mesh' : node instanceof B.TransformNode ? 'Transform' : 'Node';
        console.log(`${indent}- ${node.name} (${nodeType})`);
        
        if (depth < 5) { // Limit depth to avoid too much logging
            const children = node.getChildren ? node.getChildren() : [];
            for (const child of children) {
                this._listHierarchy(child, depth + 1);
            }
        }
    }

    /**
     * Get mesh name patterns to search for based on component ID
     * Returns multiple patterns to support different controller types
     */
    private _getComponentMeshPatterns(componentId: string): string[] {
        const patterns: string[] = [];
        
        switch (componentId) {
            case 'a-button':
                patterns.push('a-button', 'a_button', 'button-a', 'buttona');
                break;
            case 'b-button':
                patterns.push('b-button', 'b_button', 'button-b', 'buttonb');
                break;
            case 'x-button':
                patterns.push('x-button', 'x_button', 'button-x', 'buttonx');
                break;
            case 'y-button':
                patterns.push('y-button', 'y_button', 'button-y', 'buttony');
                break;
            case 'xr-standard-squeeze':
                patterns.push('squeeze', 'grip-button', 'grip_button', 'gripbutton');
                break;
            case 'xr-standard-trigger':
                patterns.push('trigger', 'trigger-button', 'trigger_button');
                break;
            case 'xr-standard-thumbstick':
                patterns.push('thumbstick', 'thumb-stick', 'thumb_stick', 'joystick');
                break;
        }
        
        return patterns;
    }

    /** Create debug coordinate grids for each controller */
    private _createDebugGrids() {
        if (!this.showDebugGrid) return;
        
        ['left', 'right'].forEach(handedness => {
            const parent = new B.TransformNode(`debug-grid-${handedness}`, this.scene);
            
            // Create a 10cm cube grid with labeled corners
            const gridSize = 0.1; // 10cm
            
            // Create grid lines (wireframe box)
            const lines: B.Vector3[][] = [];
            
            // Bottom face
            lines.push([new B.Vector3(-gridSize/2, -gridSize/2, -gridSize/2), new B.Vector3(gridSize/2, -gridSize/2, -gridSize/2)]);
            lines.push([new B.Vector3(gridSize/2, -gridSize/2, -gridSize/2), new B.Vector3(gridSize/2, -gridSize/2, gridSize/2)]);
            lines.push([new B.Vector3(gridSize/2, -gridSize/2, gridSize/2), new B.Vector3(-gridSize/2, -gridSize/2, gridSize/2)]);
            lines.push([new B.Vector3(-gridSize/2, -gridSize/2, gridSize/2), new B.Vector3(-gridSize/2, -gridSize/2, -gridSize/2)]);
            
            // Top face
            lines.push([new B.Vector3(-gridSize/2, gridSize/2, -gridSize/2), new B.Vector3(gridSize/2, gridSize/2, -gridSize/2)]);
            lines.push([new B.Vector3(gridSize/2, gridSize/2, -gridSize/2), new B.Vector3(gridSize/2, gridSize/2, gridSize/2)]);
            lines.push([new B.Vector3(gridSize/2, gridSize/2, gridSize/2), new B.Vector3(-gridSize/2, gridSize/2, gridSize/2)]);
            lines.push([new B.Vector3(-gridSize/2, gridSize/2, gridSize/2), new B.Vector3(-gridSize/2, gridSize/2, -gridSize/2)]);
            
            // Vertical lines
            lines.push([new B.Vector3(-gridSize/2, -gridSize/2, -gridSize/2), new B.Vector3(-gridSize/2, gridSize/2, -gridSize/2)]);
            lines.push([new B.Vector3(gridSize/2, -gridSize/2, -gridSize/2), new B.Vector3(gridSize/2, gridSize/2, -gridSize/2)]);
            lines.push([new B.Vector3(gridSize/2, -gridSize/2, gridSize/2), new B.Vector3(gridSize/2, gridSize/2, gridSize/2)]);
            lines.push([new B.Vector3(-gridSize/2, -gridSize/2, gridSize/2), new B.Vector3(-gridSize/2, gridSize/2, gridSize/2)]);
            
            const lineSystem = B.MeshBuilder.CreateLineSystem(`grid-lines-${handedness}`, {
                lines: lines,
            }, this.scene);
            lineSystem.color = new B.Color3(0, 1, 0); // Green grid
            lineSystem.parent = parent;
            
            // Create labeled corner points
            const corners = [
                { pos: new B.Vector3(-gridSize/2, -gridSize/2, -gridSize/2), label: "-.05,-.05,-.05" },
                { pos: new B.Vector3(gridSize/2, -gridSize/2, -gridSize/2), label: "+.05,-.05,-.05" },
                { pos: new B.Vector3(gridSize/2, -gridSize/2, gridSize/2), label: "+.05,-.05,+.05" },
                { pos: new B.Vector3(-gridSize/2, -gridSize/2, gridSize/2), label: "-.05,-.05,+.05" },
                { pos: new B.Vector3(-gridSize/2, gridSize/2, -gridSize/2), label: "-.05,+.05,-.05" },
                { pos: new B.Vector3(gridSize/2, gridSize/2, -gridSize/2), label: "+.05,+.05,-.05" },
                { pos: new B.Vector3(gridSize/2, gridSize/2, gridSize/2), label: "+.05,+.05,+.05" },
                { pos: new B.Vector3(-gridSize/2, gridSize/2, gridSize/2), label: "-.05,+.05,+.05" },
            ];
            
            corners.forEach(corner => {
                // Create sphere at corner
                const sphere = B.MeshBuilder.CreateSphere(`corner-${handedness}`, { diameter: 0.01 }, this.scene);
                sphere.position = corner.pos;
                sphere.parent = parent;
                const mat = new B.StandardMaterial(`corner-mat-${handedness}`, this.scene);
                mat.emissiveColor = new B.Color3(1, 1, 0); // Yellow
                sphere.material = mat;
                
                // Create label
                const labelPlane = B.MeshBuilder.CreatePlane(`label-${handedness}-${corner.label}`, { width: 0.06, height: 0.015 }, this.scene);
                labelPlane.position = corner.pos.add(new B.Vector3(0, 0.015, 0)); // Offset above corner
                labelPlane.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
                labelPlane.parent = parent;
                
                const labelGui = GUI.AdvancedDynamicTexture.CreateForMesh(labelPlane, 512, 128);
                const textBlock = new GUI.TextBlock();
                textBlock.text = corner.label;
                textBlock.color = "yellow";
                textBlock.fontSize = 64;
                textBlock.fontWeight = "bold";
                labelGui.addControl(textBlock);
            });
            
            this.debugGrids.set(handedness, parent);
        });
    }

    /** Update debug grid positions to follow controllers */
    private _updateDebugGrids() {
        if (!this.showDebugGrid) return;
        
        try {
            const xrInput = this.xrManager.xrHelper?.input;
            if (!xrInput) return;
            
            for (const [handedness, gridParent] of this.debugGrids.entries()) {
                const controller = xrInput.controllers.find(c => c.inputSource.handedness === handedness);
                if (!controller?.grip) continue;
                
                // Position grid at grip position with same rotation
                gridParent.position = controller.grip.getAbsolutePosition();
                gridParent.rotationQuaternion = controller.grip.rotationQuaternion?.clone() || B.Quaternion.Identity();
            }
        } catch (e) {
            console.error('[ControlsUI] Error updating debug grids:', e);
        }
    }

    public show(){
        if(this.visible) return;
        for (const label of this.labels.values()) {
            label.mesh.isVisible = true;
        }
        this.visible = true;
    }

    public hide(){
        if(!this.visible) return;
        for (const label of this.labels.values()) {
            label.mesh.isVisible = false;
        }
        this.visible = false;
    }

    public toggle(){
        if(this.visible) this.hide(); else this.show();
    }

    dispose(){
        for (const label of this.labels.values()) {
            label.gui.dispose();
            label.mesh.dispose();
        }
        this.labels.clear();
        
        // Dispose debug grids
        for (const grid of this.debugGrids.values()) {
            grid.dispose();
        }
        this.debugGrids.clear();
        
        if(this.updateObserver){
            this.scene.onBeforeRenderObservable.remove(this.updateObserver);
            this.updateObserver = null;
        }
        
        this.visible = false;
    }
}

export default ControlsUI;
