import * as B from "@babylonjs/core";
import {ParamBuilder} from "./parameters/ParamBuilder.ts";
import {CustomParameter, IParameter, IWamConfig, ParameterInfo, WamInstance} from "./types.ts";
import {AudioNode3D} from "./AudioNode3D.ts";
import {AudioNodeState} from "../network/types.ts";
import { XRInputStates } from "../xr/types.ts";
import { App } from "../App.ts";

class Drag implements B.Behavior<B.AbstractMesh> {

    name="test"
    interval: number|null=null
    selected: B.AbstractMesh|null=null
    drag

    constructor(
        private app: App
    ){
        this.drag=new B.PointerDragBehavior({ dragPlaneNormal: new B.Vector3(0, 0, 1) });
    }

    init(): void {
        this.interval=setInterval(() => {
            
        },50)

        console.log("init")
        this.app.xrManager.xrHelper.input.controllers.forEach(controller => {
            const thumbstick = controller.motionController?.getComponent("xr-standard-thumbstick");
            thumbstick?.onAxisValueChangedObservable.add((axis) => {
                if(this.selected){
                    this.selected.removeBehavior(this.drag);
                    this.selected.position.z -= axis.y*0.1;
                    this.drag.attach(this.selected!);
                    this.selected.addBehavior(this.drag);
                }
            });
            console.log("components",controller.pointer.position.asArray())
        });
    }

    attach(target: B.AbstractMesh): void {

        target?.actionManager?.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickDownTrigger, (event) => {


            if(!this.selected)this.app.xrManager.xrFeaturesManager.disableFeature(B.WebXRFeatureName.MOVEMENT);
            this.selected=target;
            this.selected.addBehavior(this.drag);
            console.log("down")
        }))

        const on_up=()=>{
            if(this.selected)this.app.xrManager.xrFeaturesManager.enableFeature(B.WebXRFeatureName.MOVEMENT, "latest", {
                xrInput: this.app.xrManager.xrHelper.input,
                movementSpeed: 0.2,
                rotationSpeed: 0.3,
            });
            this.selected?.removeBehavior(this.drag);
            this.selected=null
            console.log("up")
        }

        target?.actionManager?.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, on_up))  
        target?.actionManager?.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, on_up))  
    }

    detach(): void {
        if(this.interval!=null)clearTimeout(this.interval)
    }

}

export class Wam3D extends AudioNode3D {
    private readonly _config: IWamConfig;
    private _usedParameters!: CustomParameter[];
    private _wamInstance!: WamInstance;
    private _parametersInfo!: {[name: string]: ParameterInfo};
    private _parameter3D: {[name: string]: IParameter} = {};
    private _paramBuilder!: ParamBuilder;
    private readonly _configFile!: string;
    private boundingBox! : B.AbstractMesh;
    
    constructor(scene: B.Scene, audioCtx: AudioContext, id: string, config: IWamConfig, configFile: string) {
        super(scene, audioCtx, id);
        this._config = config;
        this._configFile = configFile;

        
    
    }

    private async _initWamInstance(wamUrl: string): Promise<WamInstance> {
        // Init WamEnvironment
        const scriptUrl: string = 'https://mainline.i3s.unice.fr/wam2/packages/sdk/src/initializeWamHost.js';
        const { default: initializeWamHost } = await import(/* @vite-ignore */ scriptUrl);
        const [hostGroupId] = await initializeWamHost(this._audioCtx);

        // Import WAM
        const { default: WAM } = await import(/* @vite-ignore */ wamUrl);
        return await WAM.createInstance(hostGroupId, this._audioCtx) as WamInstance;
    }

    public async instantiate(): Promise<void> {
        this._wamInstance = await this._initWamInstance(this._config.url);
        this._parametersInfo = await this._wamInstance.audioNode._wamNode.getParameterInfo() as {[name: string]: ParameterInfo};
        this._paramBuilder = new ParamBuilder(this._scene, this._config);

        this._usedParameters = this._config.customParameters.filter((param: CustomParameter): boolean => param.used);
        
        this._createBaseMesh();
        for (let i: number = 0; i < this._usedParameters.length; i++) {
            await this._createParameter(this._usedParameters[i], i);
        }

        // gizmo
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

        this._initActionManager();
        console.log("createNode",this.baseMesh.position)
        this._createInput(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), this.baseMesh.position.y, this.baseMesh.position.z));
        this._createOutput(new B.Vector3(this._usedParameters.length / 2 + 0.2, this.baseMesh.position.y, this.baseMesh.position.z));
        // shadow
        this._app.shadowGenerator.addShadowCaster(this.baseMesh);
        this.createBoundingBox();
        this.moveBoundingBox();
        this._app.menu.hide();
    }

    protected _createBaseMesh(): void {
        const size: number = this._usedParameters.length;
        this.baseMesh = B.MeshBuilder.CreateBox('box', { width: size, height: 0.2 }, this._scene);

        const material = new B.StandardMaterial('material', this._scene);
        material.diffuseColor = new B.Color3(0, 0, 0);
        this.baseMesh.material = material;


    }
   // Create bounding box should be the parent of the node and the parameters and Wam3D
   public createBoundingBox(): void {
    const size = this._usedParameters.length;
    this.boundingBox = B.MeshBuilder.CreateBox(`boundingBox${this.id}`, { width: size + 2, height: 1.5, depth: 1.5 }, this._scene);
    this.boundingBox.isVisible = true;
    this.boundingBox.visibility = 0.5; // Adjust visibility as needed
    this.boundingBox.showBoundingBox = true; // Optionally show the bounding box
    // make the boundingbox no clickable
    this.boundingBox.isPickable = false;
    this.baseMesh.parent = this.boundingBox;
    if (this.inputMesh) this.inputMesh.parent = this.boundingBox;
    if (this.outputMesh) this.outputMesh.parent = this.boundingBox;
    const data = this._app._sendPlayerState();
    
    this.boundingBox.position = new B.Vector3(data.position.x, data.position.y+0.3, data.position.z+3.5);
    // this.boundingBox.setDirection(new B.Vector3(data.direction.x, data.direction.y, data.direction.z));
    // rotate on x axis
    this.boundingBox.rotation.x = -Math.PI / 6;


    // this.boundingBox.position = new B.Vector3(this.baseMesh.position.x, this.baseMesh.position.y + 0.75, this.baseMesh.position.z);
}



protected moveBoundingBox(): void {
    const highlightLayer = new B.HighlightLayer(`hl${this.id}`, this._scene);
    this.boundingBox.actionManager = new B.ActionManager(this._scene);

    this.boundingBox.addBehavior(new Drag(this._app));
    

        const xrRightInputStates: XRInputStates = this._app.xrManager.xrInputManager.rightInputStates;
        const xrLeftInputStates: XRInputStates = this._app.xrManager.xrInputManager.leftInputStates;
        if (xrRightInputStates || xrLeftInputStates) {
            xrRightInputStates['xr-standard-squeeze'].onButtonStateChangedObservable.add((component: B.WebXRControllerComponent): void => {
                if (component.pressed)  this.boundingBox.isPickable = true;
                else  this.boundingBox.isPickable = false;

            });
            xrLeftInputStates['xr-standard-squeeze'].onButtonStateChangedObservable.add((component: B.WebXRControllerComponent): void => {
                if (component.pressed)  this.boundingBox.isPickable = true;
                else  this.boundingBox.isPickable = false;

            });
        }


    this.boundingBox.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
        highlightLayer.addMesh(this.boundingBox as B.Mesh, B.Color3.Black());
    }));

    this.boundingBox.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
        highlightLayer.removeMesh(this.boundingBox as B.Mesh);
    }));

}



private _updateZPosition(value: number): void {
    if (this.boundingBox) {
        this.boundingBox.position.z += value * 0.1; // Adjust speed as needed
    }
}


    private async _createParameter(param: CustomParameter, index: number): Promise<void> {
        const parameterStand: B.Mesh = this._createParameterStand(new B.Vector3(index - (this._usedParameters.length - 1) / 2, 0.1, this.baseMesh.position.z), param.name);

        // create 3D parameter according to its type
        let parameter3D: IParameter;
        const paramType: string = param.type ?? this._config.defaultParameter.type;
        const fullParamName: string = `${this._config.root}${param.name}`;
        const defaultValue: number = this._parametersInfo[fullParamName].defaultValue;
        switch (paramType) {
            case 'button':
                parameter3D = await this._paramBuilder.createButton(param, parameterStand, this._parametersInfo[fullParamName]);
                break;
            default:
                parameter3D = this._paramBuilder.createCylinder(param, parameterStand, this._parametersInfo[fullParamName], defaultValue);
                break;
        }

        // update audio node when parameter value changes
        parameter3D.onValueChangedObservable.add((value: number): void => {
            this._wamInstance.audioNode._wamNode.setParamValue(fullParamName, value);
        });
        parameter3D.onValueChangedObservable.notifyObservers(defaultValue);

        this._parameter3D[fullParamName] = parameter3D;
    }

    public getAudioNode(): AudioNode {
        // @ts-ignore
        return this._wamInstance.audioNode;
    }

    public connect(destination: AudioNode): void {
        // @ts-ignore
        this._wamInstance.audioNode.connect(destination);
    }

    public getState(): AudioNodeState {
        const parameters: {[name: string]: number} = {};

        this._usedParameters.forEach((param: CustomParameter): void => {
            const fullParamName: string = `${this._config.root}${param.name}`;
            parameters[fullParamName] = this._wamInstance.audioNode._wamNode.getParamValue(fullParamName);
        });

        const inputNodes: string[] = [];
        this.inputNodes.forEach((node: AudioNode3D): void => {
            inputNodes.push(node.id);
        });

        return {
            id: this.id,
            configFile: this._configFile,
            name: this._config.name,
            position: { x: this.baseMesh.position.x, y: this.baseMesh.position.y, z: this.baseMesh.position.z },
            rotation: { x: this.baseMesh.rotation.x, y: this.baseMesh.rotation.y, z: this.baseMesh.rotation.z },
            inputNodes: inputNodes,
            parameters: parameters
        };
    }

    public setState(state: AudioNodeState): void {
        super.setState(state);

        this._usedParameters.forEach((param: CustomParameter): void => {
            const fullParamName: string = `${this._config.root}${param.name}`;
            this._parameter3D[fullParamName].setParamValue(state.parameters[fullParamName]);
        });
    }
}