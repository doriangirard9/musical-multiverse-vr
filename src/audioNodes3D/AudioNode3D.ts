    import * as B from "@babylonjs/core";
    import {IOEvent} from "../types.ts";
    import * as GUI from "@babylonjs/gui";
    import {App} from "../App.ts";
    import {TubeParams} from "../types.ts";
    // import {XRInputStates} from "../xr/types.ts";
    import {AudioNodeState, INetworkObject} from "../network/types.ts";
    
    export abstract class AudioNode3D implements INetworkObject<AudioNodeState> {
        static menuOnScene: boolean = false;
        public static currentMenuInstance: AudioNode3D | null = null;
    
        public id!: string;
        protected readonly _scene: B.Scene;
        protected readonly _audioCtx: AudioContext;
        protected readonly _app: App = App.getInstance();
        protected readonly _pointerDragBehavior: B.PointerDragBehavior;
        public baseMesh!: B.Mesh;
        public boundingBox! : B.AbstractMesh;
    
        public inputArcs: TubeParams[] = [];
        public outputArcs: TubeParams[] = [];
    
        public tubeMesh?: B.Mesh;
    
        // Gizmo
        protected _rotationGizmo: B.RotationGizmo;
        protected _utilityLayer: B.UtilityLayerRenderer;
    
        // Menu
        protected _menu!: GUI.NearMenu;
        public _isMenuOpen: boolean = false;
    
        // IO
        public inputMesh?: B.Mesh;
        public outputMesh?: B.Mesh;
        public outputMeshBig?: B.Mesh;
        public inputMeshBig?: B.Mesh;
        public inputNodes = new Map<string, AudioNode3D>();
        public ioObservable = new B.Observable<IOEvent>();
        private _isBeingDeleted!: boolean;
    
        protected constructor(scene: B.Scene, audioCtx: AudioContext, id: string) {
            this._scene = scene;
            this._audioCtx = audioCtx;
            this.id = id;
            this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
            this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);
            this._pointerDragBehavior = new B.PointerDragBehavior();
        }
    
        public abstract instantiate(): any;
    
        public abstract connect(destination: AudioNode): void;
        public abstract disconnect(destination: AudioNode): void;
    
        public abstract getAudioNode(): AudioNode;
    
        public addInputNode(audioNode3D: AudioNode3D): void {
            this.inputNodes.set(audioNode3D.id, audioNode3D);
        }
    
        public delete(): void {
            this._hideMenu();
            this._hideRotationGizmo();
            if (this._isBeingDeleted) return;
            this._isBeingDeleted = true;
    
            // supprimer le Tube from outputNode 
            this.inputArcs.forEach((arc: TubeParams): void => {
                arc.outputNode.outputArcs.forEach((outputArc: TubeParams, index: number): void => {
                    if(outputArc.TubeMesh.name == arc.TubeMesh.name) 
                        //splice from the array the arc that is connected to the input node
                        arc.outputNode.outputArcs.splice(index, 1);
            })
            if (arc.TubeMesh) arc.TubeMesh.dispose();
            if (arc.arrow) arc.arrow.dispose();
            });
    
            // supprimer le Tube from inputNode
            this.outputArcs.forEach((arc: TubeParams): void => {
                arc.inputNode.inputArcs.forEach((inputArc: TubeParams, index: number): void => {
                    if(inputArc.TubeMesh.name == arc.TubeMesh.name) 
                        //splice from the array the arc that is connected to the output node
                        arc.inputNode.inputArcs.splice(index, 1);
                        // inputArc.TubeMesh.dispose();
                }
            )
                if (arc.TubeMesh) arc.TubeMesh.dispose();
                if (arc.arrow) arc.arrow.dispose();
            })
            //link with tube instead of audionode deleted
            this.inputArcs.forEach((inputArc: TubeParams): void => {
                this.outputArcs.forEach((outputArc: TubeParams): void => {
                    // TO DO: check if alreay connected
                        this._app.ioManager.connectNodes(inputArc.outputNode, outputArc.inputNode);
                })
            });
            
            this.outputArcs = [];
            this.inputArcs = [];
    
            // Disconnect audio node
            this.getAudioNode().disconnect();
        
            // Dispose of bounding box
            if (this.boundingBox) {
                this.boundingBox.dispose();
            }
        
            // Dispose of meshes
            this.baseMesh.dispose();
            this.inputMesh?.dispose();
            this.outputMesh?.dispose();
    
            // notify other clients to dispose the audio node
            this._app.networkManager.removeNetworkAudioNode3D(this.id);
            this._isBeingDeleted = false;
        }
    
        protected abstract _createBaseMesh(): void;
    
        protected _initActionManager(): void {
            // const highlightLayer = new B.HighlightLayer(`hl${this.id}`, this._scene);
            // this.baseMesh.actionManager = new B.ActionManager(this._scene);
    
            // const xrLeftInputStates: XRInputStates = this._app.xrManager.xrInputManager.leftInputStates;
            // this.baseMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
            //     highlightLayer.addMesh(this.baseMesh, B.Color3.Black());
    
            //     xrLeftInputStates['x-button'].onButtonStateChangedObservable.add((component: B.WebXRControllerComponent): void => {
            //         if (component.pressed) {
            //             if (this._isMenuOpen) this._hideMenu();
            //             else this._showMenu();
            //         }
            //     });
            // }));
            // this.baseMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
            //     highlightLayer.removeMesh(this.baseMesh);
            //     xrLeftInputStates['x-button'].onButtonStateChangedObservable.clear();
            // }));
    
            // // move the wam in the scene
            // this.baseMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
            //     this.baseMesh.addBehavior(this._pointerDragBehavior);
            // }));
            // this.baseMesh.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
            //     this.baseMesh.removeBehavior(this._pointerDragBehavior);
            // }));
        }
    
        protected _createParameterStand(position: B.Vector3, name: string): B.Mesh {
            const parameterStand: B.Mesh = B.MeshBuilder.CreatePlane(`parameterStand${this.id}`, { size: 0.8 }, this._scene);
            parameterStand.rotate(B.Axis.X, Math.PI / 2, B.Space.WORLD);
            parameterStand.parent = this.baseMesh;
            parameterStand.position = position;
    
            parameterStand.material = new B.StandardMaterial('material', this._scene);
            parameterStand.material.zOffset = -1;
    
            const nameTextPlane: B.Mesh = B.MeshBuilder.CreatePlane(`textPlane${this.id}`, { size: 1 }, this._scene);
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
    
      protected _createInput(position: B.Vector3): void {
        this.inputMesh = B.MeshBuilder.CreateSphere('inputSphere', { diameter: 0.5 }, this._scene);
        this.inputMeshBig = B.MeshBuilder.CreateSphere('inputSphere', { diameter: 1 }, this._scene);
        this.inputMeshBig.parent = this.inputMesh;
        this.inputMeshBig.visibility = 0;
        this.inputMesh.parent = this.baseMesh;
        this.inputMesh.position = position;
    
        // color
        const inputSphereMaterial = new B.StandardMaterial('material', this._scene);
        inputSphereMaterial.diffuseColor = new B.Color3(0, 1, 0);
        this.inputMesh.material = inputSphereMaterial;
    
        this.inputMesh.actionManager = new B.ActionManager(this._scene);
        this.inputMeshBig.actionManager = new B.ActionManager(this._scene);
    
        const highlightLayer = new B.HighlightLayer(`hl-input-${this.id}`, this._scene);
    
        this.inputMeshBig.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
            highlightLayer.addMesh(this.inputMesh as B.Mesh, B.Color3.Green());
        }));
    
        this.inputMeshBig.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
            highlightLayer.removeMesh(this.inputMesh as B.Mesh);
        }));
    
        // action manager
        this.inputMeshBig.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'input', pickType: 'down', node: this });
        }));
        this.inputMeshBig.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'input', pickType: 'up', node: this });
        }));
        this.inputMeshBig.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'input', pickType: 'out', node: this });
        }));
    }
    
        protected _createOutput(position: B.Vector3): void {
            this.outputMesh = B.MeshBuilder.CreateSphere('outputSphere', { diameter: 0.5 }, this._scene);
            this.outputMeshBig = B.MeshBuilder.CreateSphere('outputSphereBig', { diameter: 1 }, this._scene);
            this.outputMeshBig.parent = this.outputMesh; 
            this.outputMeshBig.visibility = 0;
            this.outputMesh.parent = this.baseMesh;
            this.outputMesh.position = position;
    
            // color
            const outputSphereMaterial = new B.StandardMaterial('material', this._scene);
            outputSphereMaterial.diffuseColor = new B.Color3(1, 0, 0);
            this.outputMesh.material = outputSphereMaterial;
    
            // action manager
            this.outputMesh.actionManager = new B.ActionManager(this._scene);
            this.outputMeshBig.actionManager = new B.ActionManager(this._scene);
                
            // add hightlighting on the nodes when they are survolled by the mouse
    
            const highlightLayer = new B.HighlightLayer(`hl-output-${this.id}`, this._scene);
    
            this.outputMeshBig.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
                highlightLayer.addMesh(this.outputMesh as B.Mesh, B.Color3.Red());
            }));
        
            this.outputMeshBig.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
                highlightLayer.removeMesh(this.outputMesh as B.Mesh);
            }));
        
        
            this.outputMeshBig.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
                this.ioObservable.notifyObservers({type: 'output', pickType: 'down', node: this});
            }));
            this.outputMeshBig.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
                this.ioObservable.notifyObservers({type: 'output', pickType: 'up', node: this});
            }));
            this.outputMeshBig.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (): void => {
                this.ioObservable.notifyObservers({type: 'output', pickType: 'out', node: this});
            }));
        }

        protected _createOptionsMenu(): void {
            this._menu = new GUI.NearMenu(`menu${this.id}`);
            this._app.guiManager.addControl(this._menu);
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
                this.delete();
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
    
        public abstract getState(): AudioNodeState;
    
        public setState(state: AudioNodeState): void {
            this.boundingBox.position = new B.Vector3(state.position.x, state.position.y, state.position.z);
            this.boundingBox.rotation = new B.Vector3(state.rotation.x, state.rotation.y, state.rotation.z);
            // this.baseMesh.position = new B.Vector3(this.boundingBox.position.x, this.boundingBox.position.y, this.boundingBox.position.z);
            // this.baseMesh.rotation = new B.Vector3(this.boundingBox.rotation.x, this.boundingBox.rotation.y, this.boundingBox.rotation.z);   
            state.inputNodes.forEach((id: string): void => {
                const inputNode: AudioNode3D | undefined = this._app.networkManager.getAudioNode3D(id);
                if (!this.inputNodes.has(id) && inputNode) {
                    this._app.ioManager.connectNodes(this, inputNode);
                }
            });
        }
    }