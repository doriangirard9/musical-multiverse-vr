import * as B from "@babylonjs/core";
import { IAudioNodeConfig} from "./types.ts";
import {Scene} from "@babylonjs/core";
import { controls, WamGUIGenerator, WAMGuiInitCode } from "wam3dgenerator";
import { AudioNode3D } from "./AudioNode3D.ts";
import { AudioNodeState } from "../network/types.ts";
import { WamNode } from "@webaudiomodules/api";
import { App } from "../App.ts";
import { BoundingBox } from "./BoundingBox.ts";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";

export class Wam3DNode extends AudioNode3D {
    

    declare _output_audio_node: AudioNode|WamNode
    declare _input_audio_node: AudioNode|WamNode

    declare _wam_generator: WamGUIGenerator

    constructor(scene: Scene, audioCtx: AudioContext, id: string, readonly code: WAMGuiInitCode) {
        super(scene, audioCtx, id);
    }

    public async instantiate(): Promise<void> {
        const [hostGroupId] = await App.getHostGroupId()

        const node3d = this
        const super_transform = new B.TransformNode("super_transform", this._scene)
        const transform = new B.TransformNode("root", this._scene)
        transform.parent = super_transform

        this._app.menu.hide()

        const highlightLayer = new B.HighlightLayer(`hl-output-${node3d.id}`, node3d._scene)

        this._wam_generator = await WamGUIGenerator.create_and_init(
            {
                defineAnInput(settings) {
                    const {target} = settings as {target:B.Mesh}
                    node3d._input_audio_node = settings.node
                    node3d.inputMesh = target as B.Mesh
                
                    target.actionManager = new B.ActionManager(node3d._scene);
                
                    const highlightLayer = new B.HighlightLayer(`hl-input-${node3d.id}`, node3d._scene);
                
                    const color = B.Color3.Green()
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, () => {
                        for(let m of target.getChildMeshes(false)) if(m instanceof B.Mesh) highlightLayer.addMesh(m, color)
                        if(target instanceof B.Mesh) highlightLayer.addMesh(target, color)
                    }))
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, () => {
                        for(let m of target.getChildMeshes(false)) if(m instanceof B.Mesh) highlightLayer.removeMesh(m)
                        if(target instanceof B.Mesh) highlightLayer.removeMesh(target)
                    }))
                
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, () => {
                        node3d.ioObservable.notifyObservers({ type: 'input', pickType: 'down', node: node3d });
                    }))
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, () => {
                        node3d.ioObservable.notifyObservers({ type: 'input', pickType: 'up', node: node3d });
                    }))
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, () => {
                        node3d.ioObservable.notifyObservers({ type: 'input', pickType: 'out', node: node3d });
                    }))
                },
                defineAnOutput(settings) {
                    const {target} = settings as {target:B.Mesh}
                    node3d._output_audio_node = settings.node
                    node3d.outputMesh = target as B.Mesh
                    target.actionManager = new B.ActionManager(node3d._scene)
                                            
                    const color = B.Color3.Red()
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, () => {
                        for(let m of target.getChildMeshes(false)) if(m instanceof B.Mesh) highlightLayer.addMesh(m, color)
                        if(target instanceof B.Mesh) highlightLayer.addMesh(target, color)
                    }))
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, () => {
                        for(let m of target.getChildMeshes(false)) if(m instanceof B.Mesh) highlightLayer.removeMesh(m)
                        if(target instanceof B.Mesh) highlightLayer.removeMesh(target)
                    }))

                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, () => {
                        node3d.ioObservable.notifyObservers({ type: 'output', pickType: 'down', node: node3d });
                    }))
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, () => {
                        node3d.ioObservable.notifyObservers({ type: 'output', pickType: 'up', node: node3d });
                    }))
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, () => {
                        node3d.ioObservable.notifyObservers({ type: 'output', pickType: 'out', node: node3d });
                    }))
            
                    
                },
                defineAnEventInput(settings) {
                    const {target} = settings as {target:B.Mesh}
                    node3d._input_audio_node = settings.node
                    node3d.inputMeshMidi = target as B.Mesh
                
                    target.actionManager = new B.ActionManager(node3d._scene);
                
                    const highlightLayer = new B.HighlightLayer(`hl-input-${node3d.id}`, node3d._scene);
                
                    const color = B.Color3.Green()
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, () => {
                        for(let m of target.getChildMeshes(false)) if(m instanceof B.Mesh) highlightLayer.addMesh(m, color)
                        if(target instanceof B.Mesh) highlightLayer.addMesh(target, color)
                    }))
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, () => {
                        for(let m of target.getChildMeshes(false)) if(m instanceof B.Mesh) highlightLayer.removeMesh(m)
                        if(target instanceof B.Mesh) highlightLayer.removeMesh(target)
                    }))
                
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, () => {
                        node3d.ioObservable.notifyObservers({ type: 'inputMidi', pickType: 'down', node: node3d });
                    }))
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, () => {
                        node3d.ioObservable.notifyObservers({ type: 'inputMidi', pickType: 'up', node: node3d });
                    }))
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, () => {
                        node3d.ioObservable.notifyObservers({ type: 'inputMidi', pickType: 'out', node: node3d });
                    }))
                },
                defineAnEventOutput(settings) {
                    const {target} = settings as {target:B.Mesh}
                    node3d._output_audio_node = settings.node
                    node3d.outputMeshMidi = target as B.Mesh
                    target.actionManager = new B.ActionManager(node3d._scene)
                                            
                    const color = B.Color3.Red()
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, () => {
                        for(let m of target.getChildMeshes(false)) if(m instanceof B.Mesh) highlightLayer.addMesh(m, color)
                        if(target instanceof B.Mesh) highlightLayer.addMesh(target, color)
                    }))
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, () => {
                        for(let m of target.getChildMeshes(false)) if(m instanceof B.Mesh) highlightLayer.removeMesh(m)
                        if(target instanceof B.Mesh) highlightLayer.removeMesh(target)
                    }))

                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, () => {
                        node3d.ioObservable.notifyObservers({ type: 'outputMidi', pickType: 'down', node: node3d });
                    }))
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, () => {
                        node3d.ioObservable.notifyObservers({ type: 'outputMidi', pickType: 'up', node: node3d });
                    }))
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, () => {
                        node3d.ioObservable.notifyObservers({ type: 'outputMidi', pickType: 'out', node: node3d });
                    }))
                },
                defineField(settings) {
                    const {target} = settings

                    const textValuePlane: B.Mesh = B.MeshBuilder.CreatePlane('textPlane', { size: 1, width: 5 }, node3d._scene)
                    textValuePlane.parent = super_transform
                    textValuePlane.rotate(B.Axis.X, 0, B.Space.WORLD)
                    textValuePlane.setEnabled(false)

                    const valueAdvancedTexture = AdvancedDynamicTexture.CreateForMesh(textValuePlane, 1024, Math.floor(1024/5))
                    const textValueBlock = new TextBlock()
                    textValueBlock.fontSize = 50
                    textValueBlock.color = 'white'
                    textValueBlock.outlineColor = 'black'
                    textValueBlock.outlineWidth = 5
                    valueAdvancedTexture.addControl(textValueBlock)

                    const color = B.Color3.Blue()
                    
                    let showStack=0
                    function changeShowState(offset:number){
                        showStack += offset
                        if(showStack==1){
                            for(let m of target.getChildMeshes(false)) if(m instanceof B.Mesh) highlightLayer.addMesh(m, color)
                            if(target instanceof B.Mesh) highlightLayer.addMesh(target, color)
                            textValuePlane.setEnabled(true)
                        }
                        else if(showStack==0){
                            for(let m of target.getChildMeshes(false)) if(m instanceof B.Mesh) highlightLayer.removeMesh(m)
                            if(target instanceof B.Mesh) highlightLayer.removeMesh(target)
                            textValuePlane.setEnabled(false)
                        }
                    }

                    target.actionManager = new B.ActionManager(node3d._scene);
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, () => {
                        textValuePlane.setAbsolutePosition(target.getAbsolutePosition())
                        textValuePlane.position.y += target.getBoundingInfo().boundingBox.extendSize.y
                        textValueBlock.text = settings.getName()+"\n"+settings.stringify(settings.getValue())
                        changeShowState(1)

                    }))
                    target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, () => {
                        changeShowState(-1)
                    }))

                    const sixDofDragBehavior = new B.SixDofDragBehavior()
                    sixDofDragBehavior.onDragStartObservable.add(() => changeShowState(1))
                    sixDofDragBehavior.onDragEndObservable.add(() => changeShowState(-1))
                    sixDofDragBehavior.onDragObservable.add(() => {
                        textValuePlane.setAbsolutePosition(target.getAbsolutePosition())
                        textValuePlane.position.y += target.getBoundingInfo().boundingBox.extendSize.y
                        textValueBlock.text = settings.getName()+"\n"+settings.stringify(settings.getValue())
                    })

                    sixDofDragBehavior.allowMultiPointer = false
                    sixDofDragBehavior.disableMovement = true
                    sixDofDragBehavior.rotateWithMotionController = false
                    sixDofDragBehavior.rotateDraggedObject = false
                    target.addBehavior(sixDofDragBehavior)
                                
                    let startingValue = 0
                    let stepSize = 0.01
                    let changeFactor = 0
                    sixDofDragBehavior.onDragStartObservable.add(() => {
                        startingValue = settings.getValue()
                        stepSize = settings.getStepSize()
                        if(stepSize==0){
                            stepSize = 0.001
                            changeFactor = 0.2
                        }
                        else{
                            changeFactor = stepSize*2
                        }

                    })
                    sixDofDragBehavior.onDragObservable.add((event: {delta: B.Vector3, position: B.Vector3, pickInfo: B.PickingInfo}): void => {
                        let newvalue = (startingValue + event.delta.y * changeFactor)
                        newvalue = newvalue - newvalue % stepSize
                        newvalue = Math.max(0, Math.min(1, newvalue))
                        settings.setValue(newvalue)
                        target.rotationQuaternion = null
                    })
                }
            },
            {babylonjs:transform as any},
            this.code, controls, this._audioCtx, hostGroupId
        )
        

        const size_factor = .25/this._wam_generator.calculateAverageControlSize()
        transform!!.scaling.setAll(size_factor)
        const boundinginfo = this._wam_generator.pad_mesh!!.getBoundingInfo().boundingBox.extendSize
        const boundingblock = B.MeshBuilder.CreateBox('box', {
            width: 1 *size_factor *this._wam_generator.pad_mesh!!.scaling.x,
            height: boundinginfo.y *size_factor *this._wam_generator.pad_mesh!!.scaling.y,
            depth: 1 *size_factor *this._wam_generator.pad_mesh!!.scaling.z,
        }, this._scene)
        super_transform.parent = boundingblock
        this.baseMesh = boundingblock

        this._utilityLayer = new B.UtilityLayerRenderer(this._scene)
        this._rotationGizmo = new B.RotationGizmo(this._utilityLayer)

        const bo = new BoundingBox(this, this._scene, this.id, this._app)
        this.boundingBox = bo.boundingBox
        this.boundingBox.scaling.scaleInPlace(2)

        this._initActionManager()
    }

    protected _createBaseMesh() { }

    public getAudioNode(): AudioNode {
        return this._input_audio_node
    }

    public async getState(): Promise<AudioNodeState> {
        // @ts-ignore
        return {
            id: this.id,
            configFile: {} as IAudioNodeConfig,
            position: { x: this.boundingBox.position.x, y: this.boundingBox.position.y, z: this.boundingBox.position.z },
            rotation: { x: this.boundingBox.rotation.x, y: this.boundingBox.rotation.y, z: this.boundingBox.rotation.z },
            inputNodes: [],
            parameters: {}
        };
    }

    public connect(destination: AudioNode|WamNode): void {
        this._output_audio_node.connect(destination)
        if("instanceId" in this._output_audio_node && "instanceId" in destination){
            this._output_audio_node.connectEvents(destination.instanceId);
        }
    }
    public disconnect(destination: AudioNode|WamNode): void {
        this._output_audio_node.disconnect(destination)
        if("instanceId" in this._output_audio_node && "instanceId" in destination){
            this._output_audio_node.disconnectEvents(destination.instanceId);
        }
    }

    public delete() {
        super.delete()
        this._wam_generator.dispose()
    }


}