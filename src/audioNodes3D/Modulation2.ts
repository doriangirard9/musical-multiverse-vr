import {Wam3D} from "./Wam3D.ts";
import {IParameter, IWamConfig, ParameterInfo} from "./types.ts";
import {WamAutomationEvent, WamParameterDataMap, WamParameterInfoMap} from "@webaudiomodules/api";
import {Instrument3D} from "./Instrument3D.ts";
import * as B from "@babylonjs/core";
import {Color3, MeshBuilder, Nullable, Quaternion, Scene, StandardMaterial, Vector3} from "@babylonjs/core";
import {BoundingBox} from "./BoundingBox.ts";
import {ButtonParam} from "./parameters/ButtonParam.ts";
import {ParamBuilder} from "./parameters/ParamBuilder.ts";
import {AudioEventBus} from "../AudioEvents.ts";
import {CylinderParamModulation} from "./parameters/CylinderParamModulation.ts";
import {CylinderParam} from "./parameters/CylinderParam.ts";

export class Modulation2 extends Wam3D{
    private rate: number = 4.0;
    private smoothAmount: number = 0.0;

    private readonly MAX_STEPS = 10
    private readonly CYLINDER_SPACING = 0.7;

    private isPlaying: boolean = false;
    private currentStepIndex: number = -1;
    private lastStepTime: number = 0;
    private _renderObserver: Nullable<B.Observer<B.Scene>> = null;
    private _cylinders: CylinderParamModulation[] = [];
    private _deleteButtons: ButtonParam[] = [];

    private targetStepValue: number = 0.0;
    private currentSmoothedValue: number = 0.0;

    private _parentNode: Instrument3D;
    private _targetParamId: string;

    private _tuyau!: B.Mesh;
    private _outputBackMesh: B.Mesh;
    private _outputBackMaterial: B.StandardMaterial;
    private _barMesh!: B.Mesh;
    private _addStepButton!: ButtonParam;
    private _playButton!: ButtonParam;
    private _rateControl!: CylinderParam;
    private _smoothControl!: CylinderParam;

    private eventBus = AudioEventBus.getInstance();

    private static _sequencerConfig: IWamConfig = {
        name: "Step Sequencer Modulator",
        url: "",
        root: "seq/",
        customParameters: [
            { name: 'rate', used: true, type: 'cylinder', color: '#6d4caf' },
            { name: 'smoothAmount', used: true, type: 'cylinder', color: '#07ffd2' },
        ],
        defaultParameter: { type: 'cylinder', color: '#2196F3' },
        parametersInfo: {
            "seq/rate": { defaultValue: 4.0, minValue: 0.1, maxValue: 20 },
            "seq/smoothAmount": { defaultValue: 0.0, minValue: 0.0, maxValue: 0.99 },
        }
    };

    protected _parametersInfo: WamParameterInfoMap = {
        "seq/rate": { id: "seq/rate", label:"Rate (Hz)", type: "float", defaultValue: 4.0, minValue: 0.1, maxValue: 20, normalize:v=>v, denormalize:v=>v, valueString:v=>v.toFixed(1), discreteStep:0.1, exponent:0, choices:[], units:"Hz" },
        "seq/smoothAmount": { id: "seq/smoothAmount", label:"Smooth", type: "float", defaultValue: 0.0, minValue: 0.0, maxValue: 0.99, normalize:v=>v, denormalize:v=>v, valueString:v=>v.toFixed(2), discreteStep:0.01, exponent:0, choices:[], units:"" },
        "seq/addStep": { id: "seq/addStep", label:"Add Step", type: "boolean", defaultValue: 0, minValue: 0, maxValue: 1, normalize:v=>v, denormalize:v=>v, valueString:v=>v.toString(), discreteStep:1, exponent:0, choices:[], units:"" },
        "seq/togglePlay": { id: "seq/togglePlay", label:"Play/Pause", type: "boolean", defaultValue: 0, minValue: 0, maxValue: 1, normalize:v=>v, denormalize:v=>v, valueString:v=>v.toString(), discreteStep:1, exponent:0, choices:[], units:"" },
    };


    constructor(
        scene: Scene, audioCtx: AudioContext, id: string,
        parent: Instrument3D, targetParamId: string
    ) {
        super(scene, audioCtx, id, Modulation2._sequencerConfig, Modulation2._sequencerConfig);
        this._parentNode = parent;
        this._targetParamId = targetParamId;
        this.currentSmoothedValue = this._cylinders.length > 0 ? this._cylinders[0].getValue() : 0.5;
        this.targetStepValue = this.currentSmoothedValue;


        this._outputBackMesh = MeshBuilder.CreateSphere("seqOutputBack", { diameter: 0.2 }, this._scene);
        this._outputBackMaterial = new StandardMaterial("seqOutputBackMat", this._scene);
        this._outputBackMaterial.diffuseColor = Color3.Teal();
        this._outputBackMesh.material = this._outputBackMaterial;
        this._outputBackMesh.isPickable = false;


        this._createTuyau();
    }

    public async instantiate(): Promise<void> {
        console.log(`[StepSeqMod ${this.id}] Instantiate for target: ${this._targetParamId}`);
        this._app.menu.hide();

        this._paramBuilder = new ParamBuilder(this._scene, this._config);
        this._usedParameters = this._config.customParameters.filter(p => p.used);

        this._createBaseMesh();

        this._outputBackMesh.parent = this.baseMesh;
        this._outputBackMesh.position = new Vector3(0, 0, (this.baseMesh.scaling.z / 2) + 0.1);

        await this._createGlobalControls();
        this._createStepBar();

        this._utilityLayer = new B.UtilityLayerRenderer(this._scene);
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer);
        this._initActionManager();

        const bo = new BoundingBox(this, this._scene, this.id, this._app);
        this.boundingBox = bo.boundingBox;

        console.log(`[StepSeqMod ${this.id}] Instantiated.`);
        this._scene.onBeforeRenderObservable.add(() => {
            this._updateTuyau();
        });
    }



    protected _createBaseMesh(): void {

        this.baseMesh = B.MeshBuilder.CreateBox('box', {width: 4, height: 0.2}, this._scene);


        const material = new B.StandardMaterial('material', this._scene);
        material.diffuseColor = new B.Color3(0, 0, 0);
        this.baseMesh.material = material;
    }

    private async _createGlobalControls(): Promise<void> {
        const controlAreaZ = - (this.baseMesh.scaling.z / 2) + 0.5;
        const controlY = 0.1;
        const buttonSpacing = 0.7;
        let currentX = - (buttonSpacing * 1.5);

        const addStepParamInfo = this._parametersInfo["seq/addStep"];
        const addStepStand = this._createParameterStand(new Vector3(currentX, controlY, controlAreaZ), "Add");
        this._addStepButton = new ButtonParam(this._scene, addStepStand, addStepParamInfo, "#4CAF50");
        await this._addStepButton._createButton();
        this._addStepButton.onValueChangedObservable.add(async (value) => {
            if (value === 1) {
                await this._addStep();
                this._addStepButton.setParamValue(0, true);
            }
        });
        currentX += buttonSpacing;

        const playParamInfo = this._parametersInfo["seq/togglePlay"];
        const playStand = this._createParameterStand(new Vector3(currentX, controlY, controlAreaZ), "Play");
        this._playButton = new ButtonParam(this._scene, playStand, playParamInfo, "#FF9800");
        await this._playButton._createButton();
        this._playButton.onValueChangedObservable.add((value) => {
            this.isPlaying = (value === 1);
            const playButtonCylinder = this._playButton.buttonMesh.getChildMeshes(false, (n) => n.name.includes("Cylinder"))[0];
            if (this.isPlaying && this._cylinders.length > 0) {
                this._startSequencerLoop();
                if (playButtonCylinder && playButtonCylinder.material instanceof B.StandardMaterial) playButtonCylinder.material.diffuseColor = Color3.Red();
            } else {
                this._stopSequencerLoop();
                if (playButtonCylinder && playButtonCylinder.material instanceof B.StandardMaterial) playButtonCylinder.material.diffuseColor = Color3.FromHexString("#FF9800");
            }
        });
        currentX += buttonSpacing;

        const rateParamConfig = this._config.customParameters.find(p => p.name === 'rate')!;
        const rateWamInfo = this._parametersInfo[`${this._config.root}${rateParamConfig.name}`];
        const rateStand = this._createParameterStand(new Vector3(currentX, controlY, controlAreaZ), "Rate");
        const rateSimpleInfo = { defaultValue: rateWamInfo.defaultValue, minValue: rateWamInfo.minValue, maxValue: rateWamInfo.maxValue };
        this._rateControl = this._paramBuilder.createCylinder(rateParamConfig, rateStand, rateSimpleInfo, rateWamInfo.defaultValue);
        this._rateControl.onValueChangedObservable.add((newValue) => { this.rate = newValue; });
        this._rateControl.setParamValue(this.rate, true);
        currentX += buttonSpacing;

        const smoothParamConfig = this._config.customParameters.find(p => p.name === 'smoothAmount')!;
        const smoothWamInfo = this._parametersInfo[`${this._config.root}${smoothParamConfig.name}`];
        const smoothStand = this._createParameterStand(new Vector3(currentX, controlY, controlAreaZ), "Smooth");
        const smoothSimpleInfo = { defaultValue: smoothWamInfo.defaultValue, minValue: smoothWamInfo.minValue, maxValue: smoothWamInfo.maxValue };
        this._smoothControl = this._paramBuilder.createCylinder(smoothParamConfig, smoothStand, smoothSimpleInfo, smoothWamInfo.defaultValue);
        this._smoothControl.onValueChangedObservable.add((newValue) => {
            this.smoothAmount = newValue;
        });
        this._smoothControl.setParamValue(this.smoothAmount, true);
    }


    private _createStepBar(): void {

        const barLength = this.MAX_STEPS * this.CYLINDER_SPACING;

        this._barMesh = MeshBuilder.CreateBox("bar", {
            width : barLength,
            height: 0.05,
            depth : 0.05
        }, this._scene);
        const barMat = new StandardMaterial("barMat", this._scene);
        barMat.diffuseColor = Color3.Gray();
        this._barMesh.material = barMat;
        this._barMesh.parent   = this.baseMesh;
        this._barMesh.position = new Vector3(0, 1, 1.5);
        this._barMesh.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI / 2);
    }

    private async _addStep(): Promise<void> {
        if (this._cylinders.length >= this.MAX_STEPS) {
            console.warn("[StepSeqMod] Max steps reached.");
            return;
        }

        const stepIndex = this._cylinders.length;
        const barLen = this.MAX_STEPS * this.CYLINDER_SPACING;
        const startX = -barLen / 2 + this.CYLINDER_SPACING / 2;
        const posX = startX + stepIndex * this.CYLINDER_SPACING;

        const stepParamInfo: ParameterInfo = {
            defaultValue: 0.5, minValue: 0, maxValue: 1
        };

        const stepCylinderControl = new CylinderParamModulation(
            this._scene,
            this._barMesh,
            stepParamInfo,
            stepParamInfo.defaultValue,
            "#FFFF00"
        );
        stepCylinderControl.getCylinderMesh().position.x = posX;
        stepCylinderControl.getCylinderMesh().rotation.x = Math.PI / 2;

        this._cylinders.push(stepCylinderControl);

        if (stepIndex === 0) {
            this.targetStepValue = stepCylinderControl.getValue();
            if (!this.isPlaying) {
                this.currentSmoothedValue = this.targetStepValue;
            }
        }

        const delButtonId = `seq/delStep${stepIndex}`;
        const delButtonWamInfo: WamParameterInfoMap[string] = {
            id: delButtonId, label: `Del ${stepIndex + 1}`, type: "boolean",
            defaultValue: 0, minValue: 0, maxValue: 1, normalize:v=>v, denormalize:v=>v, valueString:v=>v.toString(), discreteStep:1, exponent:0, choices:[], units:""
        };
        const delButtonStandMesh = B.MeshBuilder.CreateBox(`delStand${stepIndex}`, {size:0.2}, this._scene);
        delButtonStandMesh.parent = this._barMesh;
        delButtonStandMesh.position.set(posX, -0.8, 0);
        delButtonStandMesh.rotationQuaternion = Quaternion.RotationAxis(new Vector3(-1,0 , 0), Math.PI / 2);

        const delButton = new ButtonParam(this._scene, delButtonStandMesh, delButtonWamInfo, "#F44336");
        await delButton._createButton();
        delButton.buttonMesh.position.y = 0.1;
        delButton.buttonMesh.rotation.x = Math.PI / 2;

        delButton.onValueChangedObservable.add((value) => {
            if (value === 1) {
                this._removeStep(this._cylinders.indexOf(stepCylinderControl));
            }
        });
        this._deleteButtons.push(delButton);
    }

    private _removeStep(removedIndex: number): void {
        if (removedIndex < 0 || removedIndex >= this._cylinders.length) return;

        if (this.isPlaying) {
            if (this.currentStepIndex === removedIndex) {
                this.currentStepIndex = Math.max(0, this.currentStepIndex -1);
            } else if (this.currentStepIndex > removedIndex) {
                this.currentStepIndex--;
            }
        }

        const cylinderToRemove = this._cylinders[removedIndex];
        cylinderToRemove.dispose();

        const deleteButtonToRemove = this._deleteButtons[removedIndex];
        deleteButtonToRemove.buttonMesh.parent!.dispose();
        this._cylinders.splice(removedIndex, 1);
        this._deleteButtons.splice(removedIndex, 1);

        const barLen = this.MAX_STEPS * this.CYLINDER_SPACING;
        const startX = -barLen / 2 + this.CYLINDER_SPACING / 2;
        this._cylinders.forEach((cylCtrl, i) => {
            const x = startX + i * this.CYLINDER_SPACING;
            cylCtrl.getCylinderMesh().position.x = x;
            if (this._deleteButtons[i]) {
                this._deleteButtons[i].buttonMesh.parent!.position.x = x;
            }
        });

        if (this._cylinders.length === 0 && this.isPlaying) {
            this.isPlaying = false;
            this._playButton?.setParamValue(0, true);
            this._stopSequencerLoop();
        }
    }


    private _startSequencerLoop(): void {
        if (this._renderObserver || this._cylinders.length === 0) return;
        this.lastStepTime = this._audioCtx.currentTime;
        if (this.currentStepIndex < 0 || this.currentStepIndex >= this._cylinders.length) {
            this.currentStepIndex = 0;
        }
        if (this._cylinders.length > 0) {
            this.targetStepValue = this._cylinders[this.currentStepIndex].getValue();

            if (this.smoothAmount < 0.1) {
                this.currentSmoothedValue = this.targetStepValue;
            }
        }

        this._renderObserver = this._scene.onBeforeRenderObservable.add(this._sequenceStep);
      //  console.log("[StepSeqMod] Loop started/resumed");
    }

    private _stopSequencerLoop(): void {
        if (this._renderObserver) {
            this._scene.onBeforeRenderObservable.remove(this._renderObserver);
            this._renderObserver = null;
            this._unhighlightAllSteps();
           // console.log("[StepSeqMod] Loop stopped");
        }
    }

    private _sequenceStep = (): void => {
        if (!this._parentNode?._wamInstance?.audioNode) {
            this._stopSequencerLoop();
            return;
        }

        const currentTime = this._audioCtx.currentTime;
        const deltaTime = this._scene.getEngine().getDeltaTime() / 1000.0;
        if (this.isPlaying && this._cylinders.length > 0) {
            const stepDuration = 1.0 / this.rate;
            if (currentTime - this.lastStepTime >= stepDuration) {
                this.lastStepTime = currentTime;
                this.currentStepIndex = (this.currentStepIndex + 1) % this._cylinders.length;
                this.targetStepValue = this._cylinders[this.currentStepIndex].getValue();
                this._highlightStep(this.currentStepIndex);
            }
        } else if (!this.isPlaying && this._cylinders.length > 0 && this.currentStepIndex >=0) {
            this.targetStepValue = this._cylinders[this.currentStepIndex].getValue();
        }


        if (this._cylinders.length > 0) {

            const lerpFactor = 1.0 - this.smoothAmount;
            this.currentSmoothedValue += (this.targetStepValue - this.currentSmoothedValue) * lerpFactor * (deltaTime * 60);

            this.currentSmoothedValue = this.targetStepValue;
        } else {
            this.currentSmoothedValue = this.currentSmoothedValue * this.smoothAmount + this.targetStepValue * (1.0 - this.smoothAmount);
        }
        this.currentSmoothedValue = Math.max(0, Math.min(1, this.currentSmoothedValue));


        const automationEvent: WamAutomationEvent = {
            type: "wam-automation", data: {
                id: this._targetParamId, value: this.currentSmoothedValue, normalized: true
            }, time: this._audioCtx.currentTime
        };

        try {
            this._parentNode._wamInstance.audioNode.scheduleEvents(automationEvent);
            this.eventBus.emit('VISUAL_PARAM_UPDATE', {
                nodeId: this._parentNode.id, paramId: this._targetParamId,
                value: this.currentSmoothedValue, isNormalized: true
            });
        } catch (error) {
            console.error(`[StepSeqMod] Error scheduling event:`, error);
        }
    }


    private _highlightStep(index: number): void {
        this._cylinders.forEach((cylCtrl, i) => {
            const material = cylCtrl.getCylinderMesh().material as StandardMaterial;
            if (material) {
                if (i === index) {
                    material.emissiveColor = Color3.Teal();
                } else {
                    material.emissiveColor = Color3.Black();
                }
            }
        });
    }
    private _unhighlightAllSteps(): void {
        this._cylinders.forEach(cylCtrl => {
            const material = cylCtrl.getCylinderMesh().material as StandardMaterial;
            if (material) material.emissiveColor = Color3.Black();
        });
    }

    public connect(destination: AudioNode) {
        //this._audioNode.connect(destination);
        console.warn(`[Modulation ${this.id}] connecté à `, this._parentNode.id);
    }

    public disconnect(destination: AudioNode): void {
            console.warn(`[Modulation ${this.id}] déconnecté`);
    }

    public getAudioNode(): AudioNode {
        console.warn(`[Modulation ${this.id}] getAudioNode()`);
        const dummyGain = this._audioCtx.createGain();
        return dummyGain;
    }

    private _createTuyau(): void {
        //console.log("Creating Tuyau");
        this._tuyau = MeshBuilder.CreateCylinder("tuyau", { height: 1, diameter: 0.1 }, this._scene);
        const tuyauMaterial = new StandardMaterial("tuyauMat", this._scene);
        tuyauMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);
   //     tuyauMaterial.alpha = 0.7;
        this._tuyau.material = tuyauMaterial;
        this._tuyau.setPivotPoint(Vector3.Zero());
    }

    private _updateTuyau(): void {
        /*
                if (!this._tuyau || !this._parentParamMesh || !this._outputBackMesh || !this._parentParamMesh.isReady() || !this._outputBackMesh.isReady()) {
                    return;
                }*/
        if (!this._tuyau || !this._outputBackMesh || !this._parentNode) {
            return;
        }

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
    public delete(): void {
        console.log(`[StepSeqMod ${this.id}] Deleting...`);
        this._stopSequencerLoop();
        if (this._tuyau) this._scene.onBeforeRenderObservable.removeCallback(this._updateTuyau);
        if (this._tuyau) this._tuyau.dispose();
        if (this._barMesh) this._barMesh.dispose();
        if (this._outputBackMesh) this._outputBackMesh.dispose();

        this._cylinders.forEach(cyl => cyl.dispose());
        this._cylinders = [];
        this._deleteButtons.forEach(btn => {
            btn.buttonMesh.parent?.dispose();
            btn.buttonMesh.dispose();
        });
        this._deleteButtons = [];

        if (this._addStepButton?.buttonMesh) this._addStepButton.buttonMesh.parent?.dispose();
        if (this._addStepButton?.buttonMesh) this._addStepButton.buttonMesh.dispose();
        if (this._playButton?.buttonMesh) this._playButton.buttonMesh.parent?.dispose();
        if (this._playButton?.buttonMesh) this._playButton.buttonMesh.dispose();
        if (this._rateControl) {
            const rcMesh = (this._rateControl as any)._cylinder || (this._rateControl as any).baseMesh;
            rcMesh?.parent?.dispose();
            rcMesh?.dispose();
        }

        super.delete();
        console.log(`[StepSeqMod ${this.id}] Deleted.`);
    }


    public async getState(): Promise<any> {
        const baseState = await super.getState();
        const stepValues = this._cylinders.map(cyl => cyl.getValue());
        const sequencerState = {
            rate: this.rate,
            smoothAmount: this.smoothAmount,
            isPlaying: this.isPlaying,
            currentStepIndex: this.currentStepIndex,
            numSteps: this._cylinders.length,
            stepValues: stepValues,
            targetStepValue: this.targetStepValue,
            currentSmoothedValue: this.currentSmoothedValue
        };
        return { ...baseState, sequencerState };
    }

    public async setState(state: any): Promise<void> {
        await super.setState(state);

        if (state.sequencerState) {
            this.rate = state.sequencerState.rate ?? this.rate;
            this.smoothAmount = state.sequencerState.smoothAmount ?? this.smoothAmount;
            this._rateControl?.setParamValue(this.rate, true);
            this._smoothControl?.setParamValue(this.smoothAmount, true);


            while(this._cylinders.length > 0) { this._removeStep(0); }
            const numStepsToCreate = state.sequencerState.numSteps ?? 0;
            const stepValues = state.sequencerState.stepValues ?? [];
            for (let i = 0; i < numStepsToCreate; i++) {
                await this._addStep();
                if (this._cylinders[i] && stepValues[i] !== undefined) {
                    this._cylinders[i].setParamValue(stepValues[i], true);
                }
            }

            this.currentStepIndex = state.sequencerState.currentStepIndex ?? -1;
            this.targetStepValue = state.sequencerState.targetStepValue ?? (this._cylinders.length > 0 ? this._cylinders[0].getValue() : 0.5);
            this.currentSmoothedValue = state.sequencerState.currentSmoothedValue ?? this.targetStepValue;


            const shouldBePlaying = state.sequencerState.isPlaying ?? false;
            if (shouldBePlaying && !this.isPlaying) {
                this.isPlaying = true;
                this._playButton?.setParamValue(1, true);
                this._startSequencerLoop();
            } else if (!shouldBePlaying && this.isPlaying) {
                this.isPlaying = false;
                this._playButton?.setParamValue(0, true);
                this._stopSequencerLoop();
            }
            if (this.isPlaying && this._cylinders.length > 0 && this.currentStepIndex >= 0) {
                this._highlightStep(this.currentStepIndex);
            }
        }
     //   this._updateTuyau();
    }



}