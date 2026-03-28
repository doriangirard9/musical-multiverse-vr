import { AbstractMesh, Color4, TransformNode } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import type { AutomationN3DConnectable } from "../../tools";
import { InputManager } from "../../../xr/inputs/InputManager";
import { usingWith } from "../../../utils/utils";


export class VoiceVolumeControllerN3DGUI implements Node3DGUI {

    context!: Node3DGUIContext

    root!: TransformNode

    base!: AbstractMesh

    volume!: AbstractMesh
    pitch!: AbstractMesh

    microphone!: AbstractMesh

    led!: AbstractMesh

    disabledRotator!: AbstractMesh

    enabledRotator!: AbstractMesh

    get worldSize() { return 1.5 }

    constructor() { }

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context
        const that = this

        this.context = context

        // Root
        this.root = new B.TransformNode("voice controller root", context.scene)

        // Base plate
        this.base = B.CreateBox("voice controller base", { width: 1, height: 0.5, depth: 1 }, context.scene)
        T.MeshUtils.setColor(this.base, new B.Color4(.4, .4, .4, 1))
        this.base.parent = this.root
        this.base.position.set(0, -.25, 0)
        this.base.material = context.materialMat

        // Eye
        this.microphone = B.CreateSphere("voice controller microphone", { diameter: 1 }, context.scene)
        T.MeshUtils.setColor(this.microphone, new B.Color4(.4, .4, .4, 1))
        this.microphone.parent = this.root
        this.microphone.position.set(0, 0, 1)
        this.base.material = context.materialMat

        // LED
        this.led = B.CreateSphere("voice controller led", { diameter: .3 }, context.scene)
        T.MeshUtils.setColor(this.led, new B.Color4(1, 0, 0, 1))
        this.led.parent = this.root
        this.led.position.set(0, 0, .5+1+.15)
        this.base.material = context.materialLight

        // Rotator
        function createRotator(name: string, position: number, color: Color4) {
            const rotatorBase = B.CreateCylinder(name, { diameter: .4, height: .5 }, context.scene)
            T.MeshUtils.setColor(rotatorBase, new B.Color4(0.8, 0.8, 0.8, 1))
            rotatorBase.parent = that.root
            rotatorBase.position.set(position, 0.25, 0)

            const line = B.CreateBox(name + " line", { width: .1, height: .6, depth: .25 }, context.scene)
            T.MeshUtils.setColor(line, color)
            line.parent = rotatorBase
            line.position.set(0, 0, 0.1)
            
            return rotatorBase
        }
        this.disabledRotator = createRotator("voice controller disabled rotator", -0.25, new B.Color4(1, 0, 0, 1))
        this.enabledRotator = createRotator("voice controller enabled rotator", 0.25, new B.Color4(0, 1, 0, 1))

        // Output
        function createOutput(name: string, position: number) {
            const output = B.CreateSphere("voice controller output", { diameter: .4 }, context.scene)
            output.parent = that.root
            output.position.set(0.75, -0.25, position)
            output.material = context.materialMat
            T.MeshUtils.setColor(output, T.AutomationN3DConnectable.OutputColor.toColor4())
            return output
        }
        this.volume = createOutput("voice controller volume output", -.25)
        this.pitch = createOutput("voice controller pitch output", .25)
        
    }

    setLed(on: boolean){
        const { tools: T, babylon: B } = this.context
        T.MeshUtils.setColor(this.led, on ? new B.Color4(0, 1, 0, 1) : new B.Color4(1, 0, 0, 1))
    }

    async dispose() { }
}

export class VoiceVolumeControllerN3D implements Node3D {

    volume
    pitch

    enabledValue = 1
    disabledValue = 0

    constructor(private context: Node3DContext, private gui: VoiceVolumeControllerN3DGUI) {
        const { tools: T } = context
        const that = this

        // Hitbox
        context.addToBoundingBox(gui.base)

        // Output
        const volume = this.volume = new T.AutomationN3DConnectable.Output(
            "automation_controller_volume_output",
            [gui.volume],
            "Voice Volume",
            1
        )
        context.createConnectable(volume)

        const pitch = this.pitch = new T.AutomationN3DConnectable.Output(
            "automation_controller_pitch_output",
            [gui.pitch],
            "Voice ¨Pitch",
            1
        )
        context.createConnectable(pitch)

        // Parameter
        context.createParameter({
            id: "voice_parameter_enabled",
            meshes: [gui.enabledRotator, ...gui.enabledRotator.getChildMeshes()],
            getLabel() { return volume.name },
            getStepCount() { return volume.stepCount },
            getValue() { return that.enabledValue },
            setValue(value) {
                that.enabledValue = value
                gui.enabledRotator.rotation.y = value * Math.PI - Math.PI/2
            },
            stringify(value) { return volume.stringify(value) },
        })

        gui.enabledRotator.rotation.y = 1 * Math.PI - Math.PI/2

        context.createParameter({
            id: "voice_parameter_disabled",
            meshes: [gui.disabledRotator, ...gui.disabledRotator.getChildMeshes()],
            getLabel() { return volume.name },
            getStepCount() { return volume.stepCount },
            getValue() { return that.disabledValue },
            setValue(value) {
                that.disabledValue = value
                gui.disabledRotator.rotation.y = value * Math.PI - Math.PI/2
            },
            stringify(value) { return volume.stringify(value) },
        })

        gui.disabledRotator.rotation.y = 0 * Math.PI - Math.PI/2
    }

    async init(){
        const {audioCtx} = this.context

        // Voice
        const micro = await navigator.mediaDevices.getUserMedia({
            audio: {
                autoGainControl:false,
                noiseSuppression:false,
                echoCancellation:false,
            }
        })

        const node = audioCtx.createMediaStreamSource(micro)

        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 2048
        const data = new Uint8Array(analyser.frequencyBinCount)

        node.connect(analyser)

        setInterval(() => {
            analyser.getByteFrequencyData(data)
            let volume = 0
            let minimumPitch = 99999
            for(let i=30; i>=0; i--){
                if(data[i]>volume){
                    volume = data[i]
                }
                if(data[i]>64){
                    minimumPitch = i
                }
            }

            let volume_ratio = Math.max(0, Math.min(1, (volume-50)/180))
            this.gui.setLed(volume_ratio > 0)
            this.volume.value = volume_ratio * this.enabledValue + (1-volume_ratio) * this.disabledValue

            let pitch_ratio = Math.max(0, Math.min(1, minimumPitch/30))
            if(pitch_ratio<1) this.pitch.value = pitch_ratio * this.enabledValue + (1-pitch_ratio) * this.disabledValue
        }, 25)

        return this
    }

    async setState(key: string, value: any) { }

    async getState(key: string) { }

    getStateKeys() { return [] }

    async dispose() { }

}


export const VoiceVolumeControllerN3DFactory: Node3DFactory<VoiceVolumeControllerN3DGUI, VoiceVolumeControllerN3D> = {

    label: "Voice Volume Controller",

    description: "An automation controller that used the voice volume as input. The left rotator sets the value to the voice volume if the user is near enough.",

    tags: ["automationcontroller", "automation", "voice"],

    async createGUI(context: Node3DGUIContext) {
        const ret = new VoiceVolumeControllerN3DGUI()
        await ret.init(context)
        return ret
    },

    async create(context: Node3DContext, gui: VoiceVolumeControllerN3DGUI) {
        return await new VoiceVolumeControllerN3D(context, gui).init()
    },

}