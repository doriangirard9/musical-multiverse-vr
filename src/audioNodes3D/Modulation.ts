import {Wam3D} from "./Wam3D.ts";
import {IParameter, IWamConfig} from "./types.ts";
import {WamAutomationEvent, WamParameterDataMap, WamParameterInfoMap} from "@webaudiomodules/api";
import {Instrument3D} from "./Instrument3D.ts";
import * as B from "@babylonjs/core";
import {Color3, MeshBuilder, Nullable, Quaternion, Scene, StandardMaterial, TrailMesh, Vector3} from "@babylonjs/core";
import {BoundingBox} from "./BoundingBox.ts";
import {ButtonParam} from "./parameters/ButtonParam.ts";
import {ParamBuilder} from "./parameters/ParamBuilder.ts";
import {AudioEventBus} from "../AudioEvents.ts";

export class Modulation extends Wam3D{
    private isModulating: boolean = false;
    private currentPhase: number = 0;
    private lastTime: number = 0;
    private _renderObserver: Nullable<B.Observer<B.Scene>> = null;
    private lastVisualSpherePosition: Vector3 = Vector3.Zero();

    private _parentNode: Instrument3D | undefined;
    private _targetParamId: string;
   // private _parentParamMesh: Nullable<B.Mesh>;

    //visu
    private _tuyau!: B.Mesh;
    private _visualSphere!: B.Mesh;
    private _trailMesh! : B.TrailMesh;
    private readonly sphereYOffset = 0.3;
    private _outputBackMesh: B.Mesh;
    private _outputBackMaterial: B.StandardMaterial;
    private startButtonParam!: ButtonParam;

    private _paramControls: { [name: string]: IParameter } = {};
    protected _paramBuilder!: ParamBuilder;

    //orbiter
    private freqX: number = 2.0;
    private freqY: number = 4.0;
    private freqZ: number = 3.0;
    private ampX: number = 0.8;
    private ampY: number = 0.8;
    private ampZ: number = 0.8;
    private phaseX: number = 0;
    private phaseY: number = Math.PI / 2;
    private phaseZ: number = Math.PI;
    private lfoPhase: number = 0;
    private centerValue: number = 0.5;

    private static _modulatorConfig: IWamConfig = {
        name: "Modulation Orbiter",
        url: "",
        root: "mod/",
        customParameters: [
            { name: 'freqX', used: true, type: 'cylinder' },
            { name: 'freqY', used: true, type: 'cylinder' },
            { name: 'freqZ', used: true, type: 'cylinder' },
            { name: 'ampX', used: true, type: 'cylinder' },
            { name: 'ampY', used: true, type: 'cylinder' },
            { name: 'ampZ', used: true, type: 'cylinder' },
            { name: 'phaseX', used: true, type: 'cylinder' },
            { name: 'phaseY', used: true, type: 'cylinder' },
            { name: 'phaseZ', used: true, type: 'cylinder' },
            { name: 'centerValue', used: true, type: 'cylinder' },
        ],
        defaultParameter: {
            type: 'cylinder',
            color: '#FFA500'
        },
        parametersInfo: {
            "mod/freqX": { defaultValue: 2.0, minValue: 0.1, maxValue: 15 },
            "mod/freqY": { defaultValue: 4.0, minValue: 0.1, maxValue: 15 },
            "mod/freqZ": { defaultValue: 3.0, minValue: 0.1, maxValue: 15 },

            "mod/ampX": { defaultValue: 0.8, minValue: 0, maxValue: 5 },
            "mod/ampY": { defaultValue: 0.8, minValue: 0, maxValue: 5 },
            "mod/ampZ": { defaultValue: 0.8, minValue: 0, maxValue: 5 },
            "mod/phaseX": { defaultValue: 0, minValue: 0, maxValue: Math.PI * 2 },
            "mod/phaseY": { defaultValue: Math.PI / 2, minValue: 0, maxValue: Math.PI * 2 },
            "mod/phaseZ": { defaultValue: Math.PI, minValue: 0, maxValue: Math.PI * 2 },
            "mod/centerValue": { defaultValue: 0.5, minValue: 0, maxValue: 1 },
        }
    };

    protected _parametersInfo: WamParameterInfoMap = {
        "mod/freqX": { id: "mod/freqX", label:"Freq X", type: "float", defaultValue: 2.0, minValue: 0.1, maxValue: 15, /* ... */ normalize: v=>v, denormalize:v=>v, valueString:v=>v.toFixed(1), discreteStep:0, exponent:0, choices:[], units:"" },
        "mod/freqY": { id: "mod/freqY", label:"Freq Y", type: "float", defaultValue: 4.0, minValue: 0.1, maxValue: 15, /* ... */ normalize: v=>v, denormalize:v=>v, valueString:v=>v.toFixed(1), discreteStep:0, exponent:0, choices:[], units:"" },
        "mod/freqZ": { id: "mod/freqZ", label:"Freq Z", type: "float", defaultValue: 3.0, minValue: 0.1, maxValue: 15, /* ... */ normalize: v=>v, denormalize:v=>v, valueString:v=>v.toFixed(1), discreteStep:0, exponent:0, choices:[], units:"" },
        "mod/ampX":  { id: "mod/ampX", label:"Amp X", type: "float", defaultValue: 0.8, minValue: 0, maxValue: 5, /* ... */ normalize: v=>v, denormalize:v=>v, valueString:v=>v.toFixed(2), discreteStep:0, exponent:0, choices:[], units:"" },
        "mod/ampY":  { id: "mod/ampY", label:"Amp Y", type: "float", defaultValue: 0.8, minValue: 0, maxValue: 5, /* ... */ normalize: v=>v, denormalize:v=>v, valueString:v=>v.toFixed(2), discreteStep:0, exponent:0, choices:[], units:"" },
        "mod/ampZ":  { id: "mod/ampZ", label:"Amp Z", type: "float", defaultValue: 0.8, minValue: 0, maxValue: 5, /* ... */ normalize: v=>v, denormalize:v=>v, valueString:v=>v.toFixed(2), discreteStep:0, exponent:0, choices:[], units:"" },
        "mod/phaseX":{ id: "mod/phaseX", label:"Phase X", type: "float", defaultValue: 0, minValue: 0, maxValue: Math.PI * 2, /* ... */ normalize: v=>v, denormalize:v=>v, valueString:v=>v.toFixed(2), discreteStep:0, exponent:0, choices:[], units:"" },
        "mod/phaseY":{ id: "mod/phaseY", label:"Phase Y", type: "float", defaultValue: Math.PI / 2, minValue: 0, maxValue: Math.PI * 2, /* ... */ normalize: v=>v, denormalize:v=>v, valueString:v=>v.toFixed(2), discreteStep:0, exponent:0, choices:[], units:"" },
        "mod/phaseZ":{ id: "mod/phaseZ", label:"Phase Z", type: "float", defaultValue: Math.PI, minValue: 0, maxValue: Math.PI * 2, /* ... */ normalize: v=>v, denormalize:v=>v, valueString:v=>v.toFixed(2), discreteStep:0, exponent:0, choices:[], units:"" },
        "mod/centerValue": { id: "mod/centerValue", label:"Center", type: "float", defaultValue: 0.5, minValue: 0, maxValue: 1, /* ... */ normalize: v=>v, denormalize:v=>v, valueString:v=>v.toFixed(2), discreteStep:0, exponent:0, choices:[], units:"" },
        "mod/toggle": { id:"mod/toggle", label: "Start/Stop", type: "boolean", defaultValue: 0, minValue: 0, maxValue: 1, /* ... */ normalize: v=>v, denormalize:v=>v, valueString:v=>v?"On":"Off", discreteStep:1, exponent:0, choices:[], units:"" },
    };

    private eventBus = AudioEventBus.getInstance();

    constructor(scene: Scene, audioCtx: AudioContext, id: string,
                /*config: IWamConfig, configFile: IAudioNodeConfig, typeModulation: string, */
                parent: Instrument3D | undefined, targetParamId: string) {
        super(scene, audioCtx, id, Modulation._modulatorConfig, Modulation._modulatorConfig);
        this._parentNode = parent;
        this._targetParamId = targetParamId;
        this.lastTime = this._audioCtx.currentTime;

        this._outputBackMesh = MeshBuilder.CreateSphere("sphere", { diameter: 0.5 }, this._scene);
        this._outputBackMaterial = new StandardMaterial("sphereMat", this._scene);
        this._outputBackMaterial.diffuseColor = B.Color3.Red();//Color3.Orange();
        this._outputBackMesh.material = this._outputBackMaterial;
        this._outputBackMesh.isPickable = false;

        this._createTuyau();

    }


    public async instantiate(): Promise<void> {
        console.log(`[Modulation ${this.id}] Instantiate for target: ${this._targetParamId}`);
        this._app.menu.hide();

        this._paramBuilder = new ParamBuilder(this._scene, this._config);
        this._usedParameters = this._config.customParameters.filter(p => p.used);

        this._createBaseMesh();

        //pas sur
        this._outputBackMesh.parent = this.baseMesh;
        this._outputBackMesh.position = new B.Vector3( this.baseMesh.position.x, this.baseMesh.position.y, this.baseMesh.position.z+1)



        await this._createParameters3D();

        this._createVisualSphere();

        this._createTrailEffect();

        await this._createStartStopButton();

        // gizmo
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);
        this._initActionManager();

        const bo = new BoundingBox(this, this._scene, this.id, this._app)
        this.boundingBox = bo.boundingBox;

        this.eventBus.emit('WAM_LOADED', {nodeId: this.id, instance: this._wamInstance});

        console.log(`[Modulation ${this.id}] Instantiated.`);

        this._scene.onBeforeRenderObservable.add(() => {
            this._updateTuyau();
        });
    }

    private async _createStartStopButton(): Promise<void> {
        const paramInfo = this._parametersInfo["mod/toggle"];
        if (!paramInfo) {
            console.error("[Modulation] ParameterInfo erreur pas trouvé");
            return;
        }

        const paramsToCreate = Modulation._modulatorConfig.customParameters.filter(p => p.used);
        const nbParams = paramsToCreate.length;
        const posX = (nbParams ) - (this._usedParameters.length - 1) / 2;
        const standPos = new B.Vector3(posX, 0.1, this.baseMesh.position.z);

        const parameterStand = this._createParameterStand(standPos, "Start/Stop");

        this.startButtonParam = new ButtonParam(this._scene, parameterStand, paramInfo, "#00FF00");
        await this.startButtonParam._createButton();

        this.startButtonParam.onValueChangedObservable.add((value: number) => {
            this.isModulating = (value === 1);
            console.log(`[Modulation] Modulation ${this.isModulating ? 'started' : 'stopped'}`);
            if (this.isModulating) {
                this._startModulationLoop();
            } else {
                this._stopModulationLoop();
            }
            const buttonColor = this.isModulating ? "#FF0000" : "#00FF00";
            const cylinder = this.startButtonParam.buttonMesh.getChildMeshes(false, (node) => node.name.indexOf("Cylinder") !== -1)[0];
            if (cylinder && cylinder.material instanceof B.StandardMaterial) {
                cylinder.material.diffuseColor = B.Color3.FromHexString(buttonColor);
            }
        });
        this.startButtonParam.setParamValue(this.isModulating ? 1 : 0, true);
    }


    private _createVisualSphere(): void {
        this._visualSphere = B.MeshBuilder.CreateSphere(`modVisualSphere_${this.id}`, { diameter: 0.5 }, this._scene);
        const mat = new B.StandardMaterial(`modVisualMat_${this.id}`, this._scene);
        mat.diffuseColor = Color3.FromHSV(0, 1, 1);
        mat.emissiveColor = Color3.FromHSV(0, 0.5, 0.8);
        mat.specularColor = new Color3(0.2, 0.2, 0.2);
        this._visualSphere.material = mat;
        this._visualSphere.parent = this.baseMesh;
        this.lastVisualSpherePosition = new Vector3(0, this.sphereYOffset, 0);
        this._visualSphere.position = this.lastVisualSpherePosition.clone();
        this._visualSphere.isPickable = false;
    }

    private _createTrailEffect(): void {

        this._trailMesh = new TrailMesh(`modTrail_${this.id}`, this._visualSphere, this._scene, 0.15, 60, true);

        const trailMaterial = new StandardMaterial(`modTrailMat_${this.id}`, this._scene);
        trailMaterial.diffuseColor = Color3.FromHexString("#FFD700");
        trailMaterial.emissiveColor = Color3.FromHexString("#FFA500");
        trailMaterial.specularColor = Color3.Black();
        trailMaterial.alpha = 0.7;

        this._trailMesh.material = trailMaterial;
    }


    private _modulationStep = (): void => {
        // @ts-ignore
        if (!this.isModulating || !this._parentNode?._wamInstance?.audioNode) {
            this._stopModulationLoop();
            return;
        }

        const currentTime = this._audioCtx.currentTime;
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        this.currentPhase += deltaTime;
        const t = this.currentPhase;

        const x = Math.sin(this.freqX * t + this.phaseX);
        const y = Math.sin(this.freqY * t + this.phaseY);
        const z = Math.sin(this.freqZ * t + this.phaseZ);
        let modulationValue = ((this.ampY * y + 1) * 0.5)/5;

//        let modulationValue = (this.centerValue + (this.ampX * x * 0.5));

  //      modulationValue = Math.max(0, Math.min(1, modulationValue));

        const automationEvent: WamAutomationEvent = {
            type: "wam-automation",
            data: {
                id: this._targetParamId,
                value: modulationValue,
                normalized: true
            },
            time: currentTime
        };

        try {
            //pas sur
            // @ts-ignore
            this._parentNode._wamInstance.audioNode.scheduleEvents(automationEvent);
            //this._parentNode.audioNode.scheduleEvents(automationEvent);
            this.eventBus.emit('VISUAL_PARAM_UPDATE', {
                nodeId: this._parentNode.id,
                paramId: this._targetParamId,
                value: modulationValue,
                isNormalized: true
            });

            //console.log(`[Modulation] Sent automation: ${this._targetParamId} = ${modulationValue.toFixed(3)} at time ${currentTime.toFixed(3)}`);
            requestAnimationFrame(async () => {
                // @ts-ignore
                if (this._parentNode?._wamInstance?.audioNode) {
                    try {
                        // @ts-ignore
                        const values: WamParameterDataMap = await this._parentNode._wamInstance.audioNode.getParameterValues(true, this._targetParamId);
                        if (values && values[this._targetParamId]) {
                            //console.log(`[Modulation ${this.id}]  WAM value for ${this._targetParamId}: ${values[this._targetParamId].value.toFixed(3)} `);
                        } else {
                          //  console.log(`[Modulation ${this.id}] Could not verify WAM value for ${this._targetParamId}.`);
                        }
                    } catch (verifyError) {
                        console.error(`[Modulation ${this.id}] Error verifying WAM parameter value for ${this._targetParamId}:`, verifyError);
                    }
                }
            });


        } catch (error) {
            console.error(`[Modulation] Error scheduling event:`, error);
            this._stopModulationLoop();
        }


        if (this._visualSphere) {
            const visualScaleX = (this.baseMesh.scaling.x / 2.5) * this.ampX;
            const visualScaleY = (this.baseMesh.scaling.y * 2) * this.ampY;
            const visualScaleZ = (this.baseMesh.scaling.z / 2.5) * this.ampZ;

            this.lastVisualSpherePosition.set(
                x * visualScaleX,
                y * visualScaleY + this.sphereYOffset,
                z * visualScaleZ
            );
            this._visualSphere.position = this.lastVisualSpherePosition;


            const colorHue = (y * this.ampY + 1) / 2 * 300;
            if(this._visualSphere.material instanceof StandardMaterial){
                this._visualSphere.material.diffuseColor = Color3.FromHSV(colorHue, 1, 1);
                this._visualSphere.material.emissiveColor = Color3.FromHSV(colorHue, 0.5, 0.8);
            }
            /*
            const visualScaleX = this.baseMesh.scaling.x ;
            const visualScaleY = this.baseMesh.scaling.z ;

            this._visualSphere.position.x = this.ampX * x * visualScaleX;
            this._visualSphere.position.z = this.ampY * y * visualScaleY;
            this._visualSphere.position.y = 0;
        */
        }
    }

    private _startModulationLoop(): void {
        if (this._renderObserver) {
            return;
        }
        this.lastTime = this._audioCtx.currentTime;
       // this.currentPhase = 0;
       this._visualSphere.position = this.lastVisualSpherePosition.clone();

        this._renderObserver = this._scene.onBeforeRenderObservable.add(this._modulationStep);
       // console.log("[Modulation] Loop started");
    }

    private _stopModulationLoop(): void {
        if (this._renderObserver) {
            this._scene.onBeforeRenderObservable.remove(this._renderObserver);
            this._renderObserver = null;
            this.lastVisualSpherePosition = this._visualSphere.position.clone();

        //    console.log("[Modulation] Loop stopped");
        }
    }

    protected _createBaseMesh(): void {
        const size = Modulation._modulatorConfig.customParameters.filter(p=>p.used).length;
        this.baseMesh = B.MeshBuilder.CreateBox('box', {width: size+2, height: 0.2}, this._scene);

        const material = new B.StandardMaterial('material', this._scene);
        material.diffuseColor = new B.Color3(0, 0, 0);
        this.baseMesh.material = material;
    }

    public connect(destination: AudioNode) {
        console.warn(`[Modulation ${this.id}] connecté à `, this._parentNode.id);
    }

    public disconnect(destination: AudioNode): void {
            console.warn(`[Modulation ${this.id}] déconnecté`);
    }

    public getAudioNode(): AudioNode {
      //  console.warn(`[Modulation ${this.id}] getAudioNode()`);
        const dummyGain = this._audioCtx.createGain();
        return dummyGain;
    }

    private async _createParameters3D(): Promise<void> {
        if (!this._paramBuilder) return;

        const paramsToCreate = Modulation._modulatorConfig.customParameters.filter(p => p.used);
        const nbParams = paramsToCreate.length;

        for (let i = 0; i < nbParams; i++) {
            const paramConfig = paramsToCreate[i];
            const fullParamId = `${this._config.root}${paramConfig.name}`;
            const paramInfo = this._parametersInfo[fullParamId];
            if (!paramInfo) continue;

            const posX = i - (this._usedParameters.length - 1) / 2;
            const standPos = new B.Vector3(posX, 0.1, this.baseMesh.position.z);
            const parameterStand = this._createParameterStand(standPos, paramConfig.name);

            let paramControl: IParameter | undefined;
            const simpleParamInfo = {
                defaultValue: paramInfo.defaultValue,
                minValue: paramInfo.minValue,
                maxValue: paramInfo.maxValue,
            };

            switch (paramConfig.type ?? this._config.defaultParameter.type) {
                case 'cylinder':
                    paramControl = this._paramBuilder.createCylinder(paramConfig, parameterStand, simpleParamInfo, paramInfo.defaultValue);
                    break;
                default:
                    paramControl = this._paramBuilder.createCylinder(paramConfig, parameterStand, simpleParamInfo, paramInfo.defaultValue);
                    break;
            }

            if (paramControl) {
                this._paramControls[paramConfig.name] = paramControl;
                paramControl.onValueChangedObservable.add((newValue) => {
                    if (paramConfig.name in this) {
                        (this as any)[paramConfig.name] = newValue;
                    }
                });
                paramControl.setParamValue((this as any)[paramConfig.name], true);
            }
        }
    }


    private _createTuyau(): void {
       // console.log("Creating Tuyau");
        this._tuyau = MeshBuilder.CreateCylinder("tuyau", { height: 1, diameter: 0.1 }, this._scene);
        const tuyauMaterial = new StandardMaterial("tuyauMat", this._scene);
        tuyauMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);
   //     tuyauMaterial.alpha = 0.7;
        this._tuyau.material = tuyauMaterial;
        this._tuyau.setPivotPoint(Vector3.Zero());
        //this._tuyau.setPivotPoint(new B.Vector3(0, -0.5, 0));
    //    this._tuyau.isPickable = false;
    }

    private _updateTuyau(): void {
        /*
            if (!this._tuyau || !this._parentParamMesh || !this._outputBackMesh || !this._parentParamMesh.isReady() || !this._outputBackMesh.isReady()) {
                return;
        }*/

        //pas sur à verif
        const startPoint = this._parentNode.getParamModulMeshByParam(this._targetParamId).getAbsolutePosition();

        const endPoint = this._outputBackMesh.getAbsolutePosition();

        const distance = Vector3.Distance(startPoint, endPoint);

        if (distance < 0.001) {
            this._tuyau.isVisible = false;
            return;
        } else {
            this._tuyau.isVisible = true;
        }

        this._tuyau.scaling.y = distance;

        const midPoint = Vector3.Center(startPoint, endPoint);
        this._tuyau.position = midPoint;

        const direction = endPoint.subtract(startPoint).normalize();
        const yAxis = new Vector3(0, 1, 0);
        const angle = Math.acos(Vector3.Dot(yAxis, direction));
        const axis = Vector3.Cross(yAxis, direction);
        if (axis.length() !== 0) {
            axis.normalize();
            this._tuyau.rotationQuaternion = Quaternion.RotationAxis(axis, angle);
        }

    }

    //vraiment pas sur de ce truc
    public async getState(): Promise<any> {
        const baseState = await super.getState();
        const modulationState = {
            freqX: this.freqX, freqY: this.freqY, freqZ: this.freqZ,
            ampX: this.ampX, ampY: this.ampY, ampZ: this.ampZ,
            phaseX: this.phaseX, phaseY: this.phaseY, phaseZ: this.phaseZ,
            centerValue: this.centerValue,
            isModulating: this.isModulating,
            targetParamId: this._targetParamId,
            lastVisualSpherePosition: this.lastVisualSpherePosition.asArray()
        };

        return { ...baseState, modulationState };
    }

    //idem
    public setState(state: any): void {
        super.setState(state);

        if (state.modulationState) {
            this.freqX = state.modulationState.freqX ?? this.freqX;
            this.freqY = state.modulationState.freqY ?? this.freqY;
            this.freqZ = state.modulationState.freqZ ?? this.freqZ;
            this.ampX = state.modulationState.ampX ?? this.ampX;
            this.ampY = state.modulationState.ampY ?? this.ampY;
            this.ampZ = state.modulationState.ampZ ?? this.ampZ;
            this.phaseX = state.modulationState.phaseX ?? this.phaseX;
            this.phaseY = state.modulationState.phaseY ?? this.phaseY;
            this.phaseZ = state.modulationState.phaseZ ?? this.phaseZ;
            this.centerValue = state.modulationState.centerValue ?? this.centerValue;
            this._targetParamId = state.modulationState.targetParamId ?? this._targetParamId;

            if (state.modulationState.lastVisualSpherePosition && this._visualSphere) {
                this.lastVisualSpherePosition = Vector3.FromArray(state.modulationState.lastVisualSpherePosition);
                this._visualSphere.position = this.lastVisualSpherePosition.clone();
            }
            Object.keys(this._paramControls).forEach(paramName => {
                if (paramName in state.modulationState) {
                    this._paramControls[paramName].setParamValue(state.modulationState[paramName], true);
                }
            });

            const shouldBeModulating = state.modulationState.isModulating ?? false;
            if (shouldBeModulating && !this.isModulating) {
                this.isModulating = true;
                this.startButtonParam?.setParamValue(1, true);
                this._startModulationLoop();
            } else if (!shouldBeModulating && this.isModulating) {
                this.isModulating = false;
                this.startButtonParam?.setParamValue(0, true);
                this._stopModulationLoop();
            } else if (!shouldBeModulating && !this.isModulating && this._visualSphere){
                this._visualSphere.position = this.lastVisualSpherePosition.clone();
            }
        }
       // this._updateTuyau();
    }
/*
    public delete(): void {
        console.log(`[Modulation ${this.id}] Deleting...`);
        this._stopModulationLoop();
        if (this._tuyau) { }
        if (this._visualSphere) this._visualSphere.dispose();
        if (this._trailMesh) this._trailMesh.dispose();
        if (this._outputBackMesh) this._outputBackMesh.dispose();
        if (this.startButtonParam?.buttonMesh) this.startButtonParam.buttonMesh.dispose();
        Object.values(this._paramControls).forEach(control => {  });
        this._paramControls = {};
        super.delete();
    }

*/



}