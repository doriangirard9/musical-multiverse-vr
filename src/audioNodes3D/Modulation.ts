import {Wam3D} from "./Wam3D.ts";
import { IAudioNodeConfig,  IWamConfig} from "./types.ts";
import { WamParameterInfoMap} from "@webaudiomodules/api";
import {Instrument3D} from "./Instrument3D.ts";
import * as B from "@babylonjs/core";
import {Color3, MeshBuilder, Quaternion, Scene, StandardMaterial, Vector3} from "@babylonjs/core";
import {Sphere2} from "./Modulation/Sphere2.ts";
import {BoundingBox} from "./BoundingBox.ts";
import {ButtonParam} from "./parameters/ButtonParam.ts";
import {CylinderParamModulation} from "./parameters/CylinderParamModulation.ts";

export class Modulation extends Wam3D{
    private paramList: WamParameterInfoMap;
    private _typeModulation:string;
    private _parentMesh: B.Mesh;
    private _tuyau!: B.Mesh;
    private _parentNode: Instrument3D | undefined;
    private start: boolean =false;
    private tempModulationActif: number = 0;
    private tempModulationPause: number = 0;
    private tempo=120;
    private tempModulationStart: number;
    private sphere2 : Sphere2;
    private _toggleButton: B.Mesh;
    private outputBackMesh: B.Mesh;
    private outputBackMaterial: B.StandardMaterial;
    private startButtonParam!: ButtonParam;
    private _barMesh!: B.Mesh;
    private _addCylinderButtonParam!: ButtonParam;
    private _cylinders: CylinderParamModulation[] = [];
    private readonly MAX_CYLINDERS = 10;
    private _deleteButtons: ButtonParam[]    = [];
    private readonly SPACING       = 1;
    private nbCylindre =0


    constructor(scene: Scene, audioCtx: AudioContext, id: string, config: IWamConfig, configFile: IAudioNodeConfig, typeModulation: string, parent: Instrument3D | undefined, paramModul: number | undefined) {
        super(scene,audioCtx,id,config,configFile);
        this._typeModulation= typeModulation;
        this._parentNode = parent;
        this.tempModulationStart=this._audioCtx.currentTime;

        this._parentMesh = this._parentNode.getParamModulMesh(paramModul);
        this.outputBackMesh = MeshBuilder.CreateSphere("sphere", { diameter: 0.5 }, this._scene);
        this.outputBackMaterial = new StandardMaterial("sphereMat", this._scene);
        this.outputBackMaterial.diffuseColor = Color3.Red();
        this.outputBackMesh.material = this.outputBackMaterial;

        this._createTuyau();
       /* this._scene.onBeforeRenderObservable.add(() => {
            this._updateTuyau();
        });*/

    }


    public async instantiate(): Promise<void> {
        console.log("Instantiate Modulation");
        this._app.menu.hide();
       this._wamInstance = await this._initWamInstance(this._config.url);
      /*  let test : CustomParameter = {
            name: "startButton",
            used: true,
            type: "button",
            color: "#FF0000",
        }
        let config: IWamConfig = {
            name: this._config.name,
            url: this._config.url,
            customParameters: [
                test
            ],
            defaultParameter: {
                color: "#FF0000"
            },
        }

        console.log(this._config)
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
*/

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
            },
            "modulation": {
                id : "modulation",
                normalize(value: number): number {
                    return value;
                },
                denormalize(valueNorm: number): number {
                    return valueNorm;
                },
                valueString(value: number): string {
                    return value.toString();
                },
                label : "modulation",
                type : "float",
                defaultValue: 0,
                minValue: 0,
                maxValue: 1,
                discreteStep : 0,
                exponent : 0,
                choices : [],
                units : ""
            },
            "addCylinder":  {
                id: "addCylinder",
                label: "Add Cyl",
                type: "boolean",
                defaultValue: 0, minValue: 0, maxValue: 1,
                normalize: v => v, denormalize: v => v,
                valueString: v => v.toString(),
                discreteStep: 0, exponent: 0, choices: [], units: ""
            }
        };

        this._createBaseMesh();

        const spacing = 1;
        const barLength = this.MAX_CYLINDERS * spacing;
        this._barMesh = MeshBuilder.CreateBox("bar", {
            width : barLength,
            height: 0.05,
            depth : 0.05
        }, this._scene);
        const barMat = new StandardMaterial("barMat", this._scene);
        barMat.diffuseColor = Color3.Gray();
        this._barMesh.material = barMat;
        this._barMesh.parent   = this.baseMesh;
        this._barMesh.position = new Vector3(0, 0, (0.5 + 0.025));
        //         cyl.getCurrentCylinder().rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 1, 0), Math.PI / 2);
        this._barMesh.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI / 2);

        this.startButtonParam = new ButtonParam(
            this._scene,
            this.baseMesh,
            this._parametersInfo["addCylinder"],
            "#FF0000"
        );
        await this.startButtonParam._createButton();

        this._addCylinderButtonParam = new ButtonParam(
            this._scene,
            this.baseMesh,
            this._parametersInfo["startButton"],
            "#00FF00"
        );
        await this._addCylinderButtonParam._createButton();



        this._addCylinderButtonParam.buttonMesh.position.x = this.startButtonParam.buttonMesh.position.x + 0.5;


        /*for (let i: number = 0; i < this._usedParameters.length; i++) {
            await this._createParameter(this._usedParameters[i], i);
        }*/

        // gizmo
        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);

        this._initActionManager();
      //  this._createInput(new B.Vector3(-(this._usedParameters.length / 2 + 0.2), this.baseMesh.position.y, this.baseMesh.position.z));
      //  this._createOutput(new B.Vector3(this._usedParameters.length / 2 + 0.2, this.baseMesh.position.y, this.baseMesh.position.z));

        const bo = new BoundingBox(this, this._scene, this.id, this._app)
        this.boundingBox = bo.boundingBox;

        this.eventBus.emit('WAM_LOADED', {nodeId: this.id, instance: this._wamInstance});


      //  this._createOutput(new B.Vector3(this.baseMesh.position.x, this.baseMesh.position.y, this.baseMesh.position.z+0.5));


        this._initActionManagerModulation();
        this.sphere2 = new Sphere2(this._scene, this.baseMesh, this._parametersInfo["modulation"], 0);

        this.outputBackMesh.parent = this.boundingBox;

        this.outputBackMesh.position = new B.Vector3( this.baseMesh.position.x, this.baseMesh.position.y, this.baseMesh.position.z+1)


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
        console.log("Creating Tuyau");
        this._tuyau = MeshBuilder.CreateCylinder("tuyau", { height: 1, diameter: 0.1 }, this._scene);
        const tuyauMaterial = new StandardMaterial("tuyauMat", this._scene);
        tuyauMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);
        this._tuyau.material = tuyauMaterial;
        this._tuyau.setPivotPoint(Vector3.Zero());
    }

    private _updateTuyau(): void {
        const start = this._parentNode.inputMeshMidi.getAbsolutePosition();

        const end = this.outputBackMesh.getAbsolutePosition();

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
           console.log(this.tempModulationActif);
          //  console.log(this._usedParameters[0]);
            //console.log(this._parametersInfo["startButton"]);

            if (this.start) {
                this.tempModulationActif =  this._audioCtx.currentTime - this.tempModulationStart-this.tempModulationPause;
                this.sendEventAutomation(this.sphere2.updateValeValue(this.tempModulationActif));

                // if (this.tempModulationActif%this.tempo === 0) {
//}
            }
            else{
                this.tempModulationPause = this._audioCtx.currentTime - this.tempModulationStart-this.tempModulationActif;
             //   this._sphere2.updateSpherePosition(this.tempModulationPause);
            }
            //console.log("tempModulationActif"+  this.tempModulationActif);
            //console.log("tempModulationPause"+this.tempModulationPause);
            //console.log("currentTime"+this._audioCtx.currentTime);

        });

        this.startButtonParam.onValueChangedObservable.add((value: number) => {
            this.start = (value === 1);
            console.log("Start =", this.start);
        });

        this._addCylinderButtonParam.onValueChangedObservable.add(async value => {
            if (value === 1) {
                await this._addCylinder();
                this._addCylinderButtonParam.setDirectValue(0);
            }
        });

        this._scene.onBeforeRenderObservable.add(() => {
            this._updateTuyau();
        });
    }

    public sendEventAutomation(valueSphere : number): void {

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
                    valueSphere
                },
            })
        }
    }

    private async _addCylinder(): Promise<void> {
        if (this._cylinders.length >= this.MAX_CYLINDERS) {
            return;
        }

        const index = this.nbCylindre;
        this.nbCylindre++;
        const barLen = this.MAX_CYLINDERS * this.SPACING;
        const startX = -barLen / 2 + this.SPACING / 2;
        const posX = startX + this._cylinders.length * this.SPACING;

        this._parametersInfo[`cyl${index}`] = {
            id: `cyl${index}`,
            normalize: v => v,
            denormalize: v => v,
            valueString: v => v.toFixed(2),
            discreteStep: 0,
            exponent: 0,
            choices: [],
            units: "",
            label: `Cyl ${index + 1}`,
            type: "float",
            defaultValue: 0,
            minValue: 0,
            maxValue: 1,
        };

        const cyl = new CylinderParamModulation(
            this._scene,
            this._barMesh,
            this._parametersInfo[`cyl${index}`],
            this._parametersInfo[`cyl${index}`].defaultValue,
            "#FF0000"
        );
        cyl.getCurrentCylinder().position.x = posX;

        this._cylinders.push(cyl);

        cyl.onValueChangedObservable.add(v => {
            console.log(`Valeur cylindre ${index + 1} :`, v);
        });


        this._parametersInfo[`del${index}`] = {
            id: `del${index}`,
            label: `Del ${index + 1}`,
            type: "boolean",
            defaultValue: 0, minValue: 0, maxValue: 1,
            normalize: v => v, denormalize: v => v,
            valueString: v => v.toString(),
            discreteStep: 0, exponent: 0, choices: [], units: ""
        };
        const delBtn = new ButtonParam(
            this._scene,
            this._barMesh,
            this._parametersInfo[`del${index}`],
            "#0000FF"
        );
        await delBtn._createButton();

        delBtn.buttonMesh.position.x = posX;
        delBtn.buttonMesh.position.y = -0.3;
        delBtn.buttonMesh.position.z = 0.2;
        delBtn.buttonMesh.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI / 2);
        this._deleteButtons.push(delBtn);

        delBtn.onValueChangedObservable.add(value => {
            if (value === 1) {
                this._removeCylinder(index);
                delBtn.setDirectValue(0);
            }
        });
    }

    private _removeCylinder(removedIndex: number): void {
        const cyl    = this._cylinders[removedIndex];
        const delBtn = this._deleteButtons[removedIndex];
        cyl.dispose();
        delBtn.buttonMesh.dispose();

        this._cylinders.splice(removedIndex, 1);
        this._deleteButtons.splice(removedIndex, 1);

        const barLen = this.MAX_CYLINDERS * this.SPACING;
        const startX = -barLen/2 + this.SPACING/2;
        this._cylinders.forEach((c, i) => {
            const x = startX + i * this.SPACING;
            c.getCurrentCylinder().position.x        = x;
            this._deleteButtons[i].buttonMesh.position.x = x;
        });
    }

}