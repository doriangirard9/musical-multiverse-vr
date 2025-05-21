import { AbstractMesh, ActionManager, Color3, ExecuteCodeAction, HighlightLayer, Mesh, MeshBuilder, Observable, Observer } from "@babylonjs/core";
import {IOEvent} from "../types.ts";
import {App} from "../App.ts";
import {Pedal3D} from "./ConnecterWAM/ExAudioNode3D.ts";
import {DragBoundingBox} from "../audioNodes3D/DragBoundingBox.ts";
import {RotateBoundingBox} from "../audioNodes3D/RotateBoundingBox.ts";


/**
 * Every pedal3d has to be wrapped in a Pedal3DObject.
 * The Pedal3DObject defined the behaviours shared by all pedal3d.
 */
export class Pedal3DObject{

    /** Observable for input and output connections events */
    readonly ioObservable: Observable<IOEvent>

    /** The drag and rotation bounding box of the pedal */
    readonly boundingBox: AbstractMesh

    private dragBehaviour
    private rotateBehaviour

    constructor(
        private app: App,
        public core: Pedal3D
    ){
        const node = core.createNode()
        const gui = core.createGui(node)

        core.mesh.setParent(this.boundingBox)
        core.mesh.position.set(0,0,0)

        /* Dragging and rotating */
        this.dragBehaviour = new DragBoundingBox(app)
        this.rotateBehaviour = new RotateBoundingBox(app)

        /* Input and output connections */
        const highlightLayer = new HighlightLayer(`highlight-output`, this.app.scene)
        const ioObservable = this.ioObservable = new Observable<IOEvent>()
        const pedalObject = this

        function treatConnectable(connectable: Pedal3DConnectable, color: Color3, type: "output"|"input", index: number){
            const {mesh,audioNode,setConnect} = connectable
            mesh.actionManager = new ActionManager(app.scene)

            // Highlight the connectable meshes when the mouse is over
            mesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, ()=>{
                for(let m of mesh.getChildMeshes(false)) if(m instanceof Mesh) highlightLayer.addMesh(m, color)
                if(mesh instanceof Mesh) highlightLayer.addMesh(mesh, color)
                console.log(mesh)
            }))

            mesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, ()=>{
                for(let m of mesh.getChildMeshes(false)) if(m instanceof Mesh) highlightLayer.removeMesh(m)
                if(mesh instanceof Mesh) highlightLayer.removeMesh(mesh)
            }))

            // Send a dragging/dropping event when the connectable is dragged/dropped
            // The events are use to create the connections between the pedals by another part of the program
            mesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnLeftPickTrigger, () => {
                console.log("down")
                ioObservable.notifyObservers({type, pickType: 'down', pedal: pedalObject, index});
            }))
            mesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickUpTrigger, () => {
                ioObservable.notifyObservers({type, pickType: 'up', pedal: pedalObject, index});
            }))
            mesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickOutTrigger, () => {
                ioObservable.notifyObservers({type, pickType: 'out', pedal: pedalObject, index});
            }))

        }
        for(let i=0; i<gui.inputs.length; i++) treatConnectable(core.inputs[i], Color3.Green(), "input", i)
        for(let i=0; i<core.outputs.length; i++) treatConnectable(core.outputs[i], Color3.Red(), "output", i)


        // Use a behaviour to make sure the pedal3dobject is initialized and disposed properly
        this.core.mesh.addBehavior({
            name: "pedal3dobject behaviour",
            attach: this.init.bind(this),
            detach: this.dispose.bind(this),
            init() {},
        })

    }

    private squeezeObserver?: Observer<any>

    private init(){
        this.boundingBox.addBehavior(this.dragBehaviour)

        const xrRightInputStates = this.app.xrManager.xrInputManager.rightInputStates
        this.squeezeObserver=xrRightInputStates['xr-standard-squeeze'].onButtonStateChangedObservable.add((event)=>{
            console.log(event.value)
            if(event.value<1){
                this.boundingBox.addBehavior(this.dragBehaviour)
                this.boundingBox.removeBehavior(this.rotateBehaviour)
            }
            else{
                this.boundingBox.removeBehavior(this.dragBehaviour)
                this.boundingBox.addBehavior(this.rotateBehaviour)
            }
        });
    }

    private dispose(){
        this.squeezeObserver?.remove()
    }



    private input_connection: {from:number, to:number}[] = []

    private output_connection: {from:number, to:number}[] = []


    /** Connect to another node */
    connectTo(node: AudioNode, wamnode?: WamNode, )

}

class eeeeezzzztttttyyyy {
    public async instantiate(): Promise<void> {
        const [hostGroupId] = await App.getHostGroupId()

        const node3d = this
        const super_transform = new B.TransformNode("super_transform", this._scene)
        const transform = new B.TransformNode("root", this._scene)
        transform.parent = super_transform

        const highlightLayer = new B.HighlightLayer(`hl-connectors-${node3d.id}`, node3d._scene)

        function initConnector(color: B.Color3, target: B.AbstractMesh, type: IOEvent['type']){
            target.actionManager = new B.ActionManager(node3d._scene);

            target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, () => {
                for(let m of target.getChildMeshes(false)) if(m instanceof B.Mesh) highlightLayer.addMesh(m, color)
                if(target instanceof B.Mesh) highlightLayer.addMesh(target, color)
            }))
            target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, () => {
                for(let m of target.getChildMeshes(false)) if(m instanceof B.Mesh) highlightLayer.removeMesh(m)
                if(target instanceof B.Mesh) highlightLayer.removeMesh(target)
            }))

            target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnLeftPickTrigger, () => {
                node3d.ioObservable.notifyObservers({ type, pickType: 'down', node: node3d });
            }))
            target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickUpTrigger, () => {
                node3d.ioObservable.notifyObservers({ type, pickType: 'up', node: node3d });
            }))
            target.actionManager.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickOutTrigger, () => {
                node3d.ioObservable.notifyObservers({ type, pickType: 'out', node: node3d });
            }))
        }

        this._wam_generator = await WamGUIGenerator.create_and_init(
            {
                defineAnInput(settings) {
                    const {target} = settings as {target:B.Mesh}
                    node3d._input_audio_node = settings.node
                    node3d.inputMesh = target as B.Mesh
                    initConnector(B.Color3.Green(), target, 'input')
                },
                defineAnOutput(settings) {
                    const {target} = settings as {target:B.Mesh}
                    node3d._output_audio_node = settings.node
                    node3d.outputMesh = target as B.Mesh
                    initConnector(B.Color3.Red(), target, 'output')
                },
                defineAnEventInput(settings) {
                    const {target} = settings as {target:B.Mesh}
                    node3d._input_audio_node = settings.node
                    node3d.inputMeshMidi = target as B.Mesh
                    initConnector(B.Color3.Green(), target, 'inputMidi')
                },
                defineAnEventOutput(settings) {
                    const {target} = settings as {target:B.Mesh}
                    node3d._output_audio_node = settings.node
                    node3d.outputMeshMidi = target as B.Mesh
                    initConnector(B.Color3.Red(), target, 'outputMidi')
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
}