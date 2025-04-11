import {Wam3D} from "./Wam3D.ts";
import * as B from "@babylonjs/core";
import {CustomParameter, IAudioNodeConfig, IParameter, IWamConfig} from "./types.ts";

import {WamParameterData, WamParameterDataMap} from "@webaudiomodules/api";
import {ParamBuilder} from "./parameters/ParamBuilder.ts";
import {BoundingBox} from "./BoundingBox.ts";
import {ModuleMenu} from "./parameters/ModuleMenu.ts";
import {v4 as uuid} from "uuid";
import {Mesh} from "@babylonjs/core";

export class Instrument3D extends Wam3D {

    private _modulationMenu : ModuleMenu;
    private _parameterAsModulation : boolean[] = [];
    constructor(scene: B.Scene, audioCtx: AudioContext, id: string, config: IWamConfig, configFile: IAudioNodeConfig) {
        super(scene, audioCtx, id, config, configFile);
        this._usedParameters = this._config.customParameters.filter((param: CustomParameter): boolean => param.used);
        this._modulationMenu = new ModuleMenu(scene, this, this._usedParameters.map((param: CustomParameter) => param.name));
        for (let i = 0; i < this._usedParameters.length; i++) {
            this._parameterAsModulation.push(false);
        }
    }

    public async instantiate(): Promise<void> {
        console.error("-------------INSTRUMENT3D INSTANTIATE-----------------");
        this._app.menu.hide();
        this._wamInstance = await this._initWamInstance(this._config.url);
        this._parametersInfo = await this._wamInstance.audioNode.getParameterInfo();
        this._paramBuilder = new ParamBuilder(this._scene, this._config);
        console.log(this._parametersInfo);

        this._createBaseMesh();
        for (let i: number = 0; i < this._usedParameters.length; i++) {
            await this._createParameter(this._usedParameters[i], i);
        }


        // gizmo
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

        this._initActionManager();
        this.configureSphers();

        const bo  = new BoundingBox(this,this._scene,this.id,this._app)
        this.boundingBox = bo.boundingBox;


        this.eventBus.emit('WAM_LOADED', {nodeId: this.id, instance: this._wamInstance});
        this._createModulationButton();

    }

    public async configureSphers(): Promise<void> {
        // Load the descriptor from the WAM instance
        const descriptor = await this._wamInstance._loadDescriptor();
    
        const baseY = this.baseMesh.position.y;
        const baseZ = this.baseMesh.position.z;
    
        // Configure MIDI Input
        if (descriptor.hasMidiInput) {
            this._createInputMidi(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), baseY, baseZ + 1));
        }
    
        // Configure MIDI Output
        if (descriptor.hasMidiOutput) {
            this._createOutputMidi(new B.Vector3(this._usedParameters.length / 2 + 0.2, baseY, baseZ + 1));
        }
    
        // Configure Audio Input
        if (descriptor.hasAudioInput) {
            this._createInput(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), baseY, baseZ - 1));
        }
    
        // Configure Audio Output
        if (descriptor.hasAudioOutput) {
            this._createOutput(new B.Vector3(this._usedParameters.length / 2 + 0.2, baseY, baseZ));
        }
    }

    protected async _createParameter(param: CustomParameter, index: number): Promise<void> {
        const parameterStand: B.Mesh = this._createParameterStand(
            new B.Vector3(index - (this._usedParameters.length - 1) / 2, 0.1, this.baseMesh.position.z),
            param.name
        );

        let parameter3D: IParameter;
        const paramType: string = param.type ?? this._config.defaultParameter.type;
        const fullParamName: string = `${this._config.root}${param.name}`;
        const defaultValue: number = this._parametersInfo[fullParamName].defaultValue;
        switch (paramType) {
            case 'sphere':
                parameter3D = this._paramBuilder.createSphere(param, parameterStand, this._parametersInfo[fullParamName], defaultValue);
                break;
            case 'sphereCylinder':
                parameter3D = this._paramBuilder.createCylinder(param, parameterStand, this._parametersInfo[fullParamName], defaultValue, this._audioCtx);
                break
            case 'button':
                parameter3D = await this._paramBuilder.createButton(param, parameterStand, this._parametersInfo[fullParamName]);
                break;
            case 'menu':
                parameter3D = this._paramBuilder.createMenu(param, parameterStand, this._parametersInfo[fullParamName], defaultValue, this._parametersInfo[fullParamName].choices);
                break;
            default:
                parameter3D = this._paramBuilder.createCylinder(param, parameterStand, this._parametersInfo[fullParamName], defaultValue);
                break;
        }

        parameter3D.onValueChangedObservable.add((value: number): void => {
            console.log(`Parametettetetetr ${fullParamName} value set to ${value}`);
            let paramData: WamParameterData = {
                id: fullParamName,
                normalized: false,
                value: value,
            };
            if(paramType === 'sphereCylinder') {
                console.log("SPHERE CYLINDER");
                paramData = {
                    id: fullParamName,
                    normalized: false,
                    value: value,
                };
            }

            const paramDataMap: WamParameterDataMap = { [fullParamName]: paramData };
            this._wamInstance.audioNode.setParameterValues(paramDataMap);
        });

        parameter3D.onValueChangedObservable.notifyObservers(defaultValue);
        this._parameter3D[fullParamName] = parameter3D;
    }

    public connect(destination: AudioNode): void {
        // @ts-ignore
        this._wamInstance.audioNode.connect(destination);
    }

    protected _createInputMidi(position: B.Vector3): void {
        this.inputMeshMidi = B.MeshBuilder.CreateSphere('inputSphereMidi', { diameter: 0.5 }, this._scene);
        this.inputMeshBigMidi = B.MeshBuilder.CreateSphere('inputBigSphereMidi', { diameter: 1 }, this._scene);
        this.inputMeshBigMidi.parent = this.inputMeshMidi;
        this.inputMeshBigMidi.visibility = 0;
        this.inputMeshMidi.parent = this.baseMesh;
        this.inputMeshMidi.position = position;

        const inputSphereMaterial = new B.StandardMaterial('material', this._scene);
        inputSphereMaterial.diffuseColor = new B.Color3(0, 0, 1);
        this.inputMeshMidi.material = inputSphereMaterial;

        this.inputMeshMidi.actionManager = new B.ActionManager(this._scene);
        this.inputMeshBigMidi.actionManager = new B.ActionManager(this._scene);

        const highlightLayer = new B.HighlightLayer(`hl-input-${this.id}`, this._scene);

        this.inputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
            highlightLayer.addMesh(this.inputMeshMidi as B.Mesh, B.Color3.Blue());
        }));

        this.inputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
            highlightLayer.removeMesh(this.inputMeshMidi as B.Mesh);
        }));

        // action manager
        this.inputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'inputMidi', pickType: 'down', node: this });
        }));
        this.inputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'inputMidi', pickType: 'up', node: this });
        }));
        this.inputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'inputMidi', pickType: 'out', node: this });
        }));
    }

    protected _createOutputMidi(position: B.Vector3): void {
        this.outputMeshMidi = B.MeshBuilder.CreateSphere('outputSphereMidi', { diameter: 0.5 }, this._scene);
        this.outputMeshBigMidi = B.MeshBuilder.CreateSphere('outputBigSphereMidi', { diameter: 1 }, this._scene);
        this.outputMeshBigMidi.parent = this.outputMeshMidi;
        this.outputMeshBigMidi.visibility = 0;
        this.outputMeshMidi.parent = this.baseMesh;
        this.outputMeshMidi.position = position;

        // color
        const inputSphereMaterial = new B.StandardMaterial('material', this._scene);
        inputSphereMaterial.diffuseColor = new B.Color3(0, 0, 1);
        this.outputMeshMidi.material = inputSphereMaterial;

        this.outputMeshMidi.actionManager = new B.ActionManager(this._scene);
        this.outputMeshBigMidi.actionManager = new B.ActionManager(this._scene);

        const highlightLayer = new B.HighlightLayer(`hl-outputMidi-${this.id}`, this._scene);

        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, (): void => {
            highlightLayer.addMesh(this.inputMeshMidi as B.Mesh, B.Color3.Blue());
        }));

        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, (): void => {
            highlightLayer.removeMesh(this.inputMeshMidi as B.Mesh);
        }));

        // action manager
        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'outputMidi', pickType: 'down', node: this });
        }));
        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'outputMidi', pickType: 'up', node: this });
        }));
        this.outputMeshBigMidi.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, (): void => {
            this.ioObservable.notifyObservers({ type: 'outputMidi', pickType: 'out', node: this });
        }));
    }

    public disconnect(destination: AudioNode): void {
        // @ts-ignore
        this._wamInstance.audioNode.disconnectEvents(destination);
    }

    private _createModulationButton(): void {
        const buttonMesh = B.MeshBuilder.CreateBox('modulationButton', { width: 0.8, height: 0.2, depth: 0.8 }, this._scene);
        buttonMesh.position.set(0,0.5, this.baseMesh.position.z+0.8);
        buttonMesh.rotation.x = -Math.PI / 4;
        buttonMesh.parent = this.baseMesh;

        const buttonMaterial = new B.StandardMaterial("buttonMaterial", this._scene);
        buttonMaterial.diffuseColor = new B.Color3(0.9, 0.9, 0.3);
        buttonMaterial.emissiveColor = new B.Color3(0.8, 0.8, 0.2);
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
        this._modulationMenu.show();
    }

    public async createModule(category: string, index: number, module: string) {
        console.log('Creating module:', module);
        console.log('Category:', category);
        console.log('Index:', index);
       // const param = this._parameter3D[category];
        if (!this._parameterAsModulation[index]) {
            this._createInputModulation(new B.Vector3(index - (this._usedParameters.length - 1) / 2, this.baseMesh.position.y, this.baseMesh.position.z - 1));

            this._parameterAsModulation[index] = true;
        }


        await this._app.createAudioNode3D("modulation", uuid(),undefined,this,index);
        this._modulationMenu.hide();

        //await this._addModulation(param, module, index,);
    }

    public getParamModulMesh(paramModul: number) {

        let sphereModule : Mesh = B.MeshBuilder.CreateSphere('inputSphereMidi', { diameter: 0.5 }, this._scene);
        let sphereModuleBig = B.MeshBuilder.CreateSphere('inputBigSphereMidi', { diameter: 1 }, this._scene);
        sphereModuleBig.parent = sphereModule;
        sphereModuleBig.visibility = 0;
        sphereModule.parent = this.baseMesh;
        sphereModule.position =  new B.Vector3(paramModul - (this._usedParameters.length - 1) / 2, 0.1, this.baseMesh.position.z);

        const inputSphereMaterial = new B.StandardMaterial('material', this._scene);
        inputSphereMaterial.diffuseColor = new B.Color3(0, 0, 1);
        sphereModule.material = inputSphereMaterial;



        return sphereModule;
    }

/*
    private createModulation() {
        const parameterStand: B.Mesh = this._createParameterStand(
            new B.Vector3(1 / 2, 0.1, this.baseMesh.position.z),
            "modulation"
        );

        const defaultValue: boolean = this.modulationMenuDisplay;

        let parameter3D: IParameter;
        parameter3D = this._paramBuilder.createButtonModulation("modulation", parameterStand, this.modulationMenuDisplay, defaultValue);
        parameter3D.onValueChangedObservable.add((value: number): void => {
            console.log(`Modulation value set to ${value}`);
            if (value)
                this._app.menu.show();
            else
                this._app.menu.hide();
        });

        //parameter3D.onValueChangedObservable.notifyObservers(defaultValue);

    }*/

    private _createInputModulation(position: B.Vector3) {
        this.inputMeshMidi = B.MeshBuilder.CreateSphere('inputSphereModulation', { diameter: 0.5 }, this._scene);
        this.inputMeshBigMidi = B.MeshBuilder.CreateSphere('inputBigSphereModulation', { diameter: 1 }, this._scene);
        this.inputMeshBigMidi.parent = this.inputMeshMidi;
        this.inputMeshBigMidi.visibility = 0;
        this.inputMeshMidi.parent = this.baseMesh;
        this.inputMeshMidi.position = position;

        const inputSphereMaterial = new B.StandardMaterial('material', this._scene);
        inputSphereMaterial.diffuseColor = new B.Color3(0.66, 0.66, 0.66);
        this.inputMeshMidi.material = inputSphereMaterial;

       // this.inputMeshMidi.actionManager = new B.ActionManager(this._scene);
        //this.inputMeshBigMidi.actionManager = new B.ActionManager(this._scene);

    }

    public AudioNode(): AudioNode {
        return this._audioNode;
    }
}