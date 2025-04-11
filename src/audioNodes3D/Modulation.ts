import {Wam3D} from "./Wam3D.ts";
import {CustomParameter, IAudioNodeConfig, IParameter, IWamConfig, ParameterInfo} from "./types.ts";
import {WamParameterData, WamParameterDataMap, WamParameterInfoMap} from "@webaudiomodules/api";
import {Instrument3D} from "./Instrument3D.ts";
import * as B from "@babylonjs/core";
import {Color3, MeshBuilder, Quaternion, Scene, StandardMaterial, Vector3} from "@babylonjs/core";
import {Sphere2} from "./Modulation/Sphere2.ts";
import {ParamBuilder} from "./parameters/ParamBuilder.ts";
import {BoundingBox} from "./BoundingBox.ts";

export class Modulation extends Wam3D{
    private paramList: WamParameterInfoMap;
    private _typeModulation:string;
    private _parentMesh: B.Mesh;
    private _tuyau!: B.Mesh;
    private _parentNode: Instrument3D | undefined;
    private _sphere2!: Sphere2;
    private start: boolean =false;
    private tempModulationActif: number = 0;
    private tempModulationPause: number = 0;
    private tempo=120;
    private tempModulationStart: number;
    private sphere2 : Sphere2;
    private startButton: B.Mesh;



    constructor(scene: Scene, audioCtx: AudioContext, id: string, config: IWamConfig, configFile: IAudioNodeConfig, typeModulation: string, parent: Instrument3D | undefined, paramModul: number | undefined) {
        super(scene,audioCtx,id,config,configFile);
        this._typeModulation= typeModulation;
        this._parentNode = parent;
        this.tempModulationStart=this._audioCtx.currentTime;

        this._parentMesh = this._parentNode.getParamModulMesh(paramModul);
        this._createTuyau();
       /* this._scene.onBeforeRenderObservable.add(() => {
            this._updateTuyau();
        });*/

    }


    public async instantiate(): Promise<void> {
        this._app.menu.hide();
        this._wamInstance = await this._initWamInstance(this._config.url);
        let test : CustomParameter = {
            name: "startButton",
            used: true,
            type: "button",
            color: "#FF0000",
        }
        this._paramBuilder = new ParamBuilder(this._scene, this._config);
        this._usedParameters = [];
        this._usedParameters.push(test);
        this._parametersInfo = {
            "startButton": {
                id : "startButton",
                normalize(value: number): number {
                    return value;
                },
                denormalize(valueNorm: number): number {
                    return valueNorm;
                },
                valueString(value: number): string {
                    return value.toString();
                },
                label : "startButton",
                type : "boolean",
                defaultValue: 0,
                minValue: 0,
                maxValue: 1,
                discreteStep : 0,
                exponent : 0,
                choices : [],
                units : ""
            }
        };
        console.log(this._parametersInfo );






        this._createBaseMesh();
        for (let i: number = 0; i < this._usedParameters.length; i++) {
            await this._createParameter(this._usedParameters[i], i);
        }
        // gizmo
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

        this._initActionManager();
        this._createInput(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), this.baseMesh.position.y, this.baseMesh.position.z));
        this._createOutput(new B.Vector3(this._usedParameters.length / 2 + 0.2, this.baseMesh.position.y, this.baseMesh.position.z));

        const bo = new BoundingBox(this, this._scene, this.id, this._app)
        this.boundingBox = bo.boundingBox;

        this.eventBus.emit('WAM_LOADED', {nodeId: this.id, instance: this._wamInstance});


        this._initActionManagerModulation();
        this.sphere2 = new Sphere2(this._scene, this.baseMesh, this._parametersInfo["modulation"], 0);
        //await this._createStartButton();

    }
    protected _createBaseMesh(): void {
        const size: number = 1;
        this.baseMesh = B.MeshBuilder.CreateBox('box', {width: size, height: 0.2}, this._scene);

        const material = new B.StandardMaterial('material', this._scene);
        material.diffuseColor = new B.Color3(0, 0, 0);
        this.baseMesh.material = material;

    }

    public connect(destination: AudioNode) {
        this._audioNode.connect(destination);
    }

    private _createTuyau(): void {
        this._tuyau = MeshBuilder.CreateCylinder("tuyau", { height: 1, diameter: 0.1 }, this._scene);
        const tuyauMaterial = new StandardMaterial("tuyauMat", this._scene);
        tuyauMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);
        this._tuyau.material = tuyauMaterial;
        this._tuyau.setPivotPoint(Vector3.Zero());
    }



    private _updateTuyau(): void {
        const start = this._parentMesh.getAbsolutePosition();
        const end = this.boundingBox.getAbsolutePosition();

        const distance = Vector3.Distance(start, end);

        this._tuyau.scaling.y = distance;

        const midPoint = Vector3.Center(start, end);
        this._tuyau.position = midPoint;

        const direction = end.subtract(start).normalize();
        const yAxis = new Vector3(0, 1, 0);
        const angle = Math.acos(Vector3.Dot(yAxis, direction));
        const axis = Vector3.Cross(yAxis, direction);
        if (axis.length() !== 0) {
            axis.normalize();
            this._tuyau.rotationQuaternion = Quaternion.RotationAxis(axis, angle);
        }
    }

    private _initActionManagerModulation(): void {
        this._scene.onBeforeRenderObservable.add(() => {
            if (this.start) {
                this.tempModulationActif =  this._audioCtx.currentTime - this.tempModulationStart-this.tempModulationPause;
                this._sphere2.updateSpherePosition(this.tempModulationActif);
                if (this.tempModulationActif%this.tempo === 0) {
                    this.sendEventAutomation();
                }
            }
            else{
                this.tempModulationPause = this._audioCtx.currentTime - this.tempModulationStart-this.tempModulationActif;
              //  this._sphere2.updateSpherePosition(this.tempModulationPause);
            }
            //console.log("tempModulationActif"+  this.tempModulationActif);
            //console.log("tempModulationPause"+this.tempModulationPause);
            //console.log("currentTime"+this._audioCtx.currentTime);

        });

        this._scene.onBeforeRenderObservable.add(() => {
            this._updateTuyau();
        });
    }

    public sendEventAutomation(): void {

        if (!this.paramList) {
            return
        }

        for (let id of Object.keys(this.paramList)) {

            let param = this.paramList[id]
            let value = param.minValue + (Math.random() * (param.maxValue - param.minValue))
            if (param.type != "float") {
                value = Math.round(value)
            }


            // @ts-ignore
            this._parentNode._audioNode.scheduleEvents({
                type: "wam-automation",
                data: {
                    id: id,
                    normalized: false,
                    value
                },
            })
        }
    }

    private async _createStartButton() {
        const parameterStand: B.Mesh = this._createParameterStand(
            new B.Vector3(0 - (this._usedParameters.length - 1) / 2, 0.1, this.baseMesh.position.z),
            "start button"
        );

        let test : CustomParameter = {
            name: "start",
            used: true,
            type: "button",
            color: "#FF0000",
        }
        let test2 : ParameterInfo = {
            defaultValue: 0,
            maxValue: 1,
            minValue: 0
        }
        let parameter3D: IParameter = await this._paramBuilder.createButton(test, parameterStand, test2);

        parameter3D.onValueChangedObservable.add((value: number): void => {
            console.log(`Parametettetetetr start buttonvalue set to ${value}`);
            let paramData: WamParameterData = {
                id: "start button",
                normalized: false,
                value: value,
            };
            const paramDataMap: WamParameterDataMap = { ["start button"]: paramData };
            this._wamInstance.audioNode.setParameterValues(paramDataMap);
        });

        parameter3D.onValueChangedObservable.notifyObservers(0);
        this._parameter3D["start button"] = parameter3D;
    }
}