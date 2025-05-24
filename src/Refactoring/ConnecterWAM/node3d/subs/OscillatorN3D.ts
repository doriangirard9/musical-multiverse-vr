import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DContext } from "../Node3DContext";
import type { Node3DGUIContext } from "../Node3DGUIContext";


export class OscillatorN3DGUI implements Node3DGUI{
    
    audioOutput
    block
    root
    frequency

    constructor(context: Node3DGUIContext){
        const {babylon:B,tools:T} = context

        this.root = new B.TransformNode("test root", context.scene)

        this.audioOutput = B.CreateSphere("test button", {diameter:.5}, context.scene)
        T.MeshUtils.setColor(this.audioOutput, new B.Color4(1,0,0,1))
        this.audioOutput.parent = this.root
        this.audioOutput.position.set(0.75,-.25,0)

        this.block = B.CreateBox("test box",{width:1,depth:1,height:.5}, context.scene)
        this.block.parent = this.root
        this.block.position.set(0,-.25,0)

        this.frequency = B.CreateSphere("frequency param", {diameter:.5}, context.scene)
        this.frequency.parent = this.root
        this.frequency.position.set(0,0.25,0)
    }

    async dispose(){ }
}


export class OscillatorN3D implements Node3D{

    audionode: OscillatorNode

    constructor(context: Node3DContext, private gui: OscillatorN3DGUI){
        const {tools:T} = context

        context.addToBoundingBox(gui.block)

        const audionode = this.audionode = context.audioCtx.createOscillator()
        audionode.frequency.value = 130 // Hz
        audionode.start()

        context.createConnectable(new T.AudioN3DConnectable.Output("audioOutput", [gui.audioOutput], "Audio Output", audionode))

        context.createParameter({
            id: "frequency",
            getLabel() { return "Frequency" },
            getStepCount() { return 10 },
            getValue() { return (audionode.frequency.value-130)/100 },
            setValue(value: number) { 
                audionode.frequency.value = value * 100 + 130
                gui.frequency.scaling.setAll(value * .8 + .2)
                context.notifyStateChange("frequency")
            },
            meshes: [gui.frequency],
            stringify(value) { return `Frequency: ${Math.round(value * 100 + 130)} Hz` },
        })
    }

    async setState(key: string, value: any){
        const self = this
        ;({
            frequency(value:any){
                self.audionode.frequency.value = value * 100 + 130, self.audionode.context.currentTime, 0.01
                self.gui.frequency.scaling.setAll(value * .8 + .2)
            }
        })[key]!!?.(value)
    }

    async getState(key: string){
        const self = this
        return ({
            frequency(){
                return (self.audionode.frequency.value - 130) / 100
            }
        })[key]!!?.()
    }

    getStateKeys(){ return ["frequency"] }
    
    async dispose(){ }

}


export const OscillatorN3DFactory: Node3DFactory<OscillatorN3DGUI,OscillatorN3D> = {

    label: "Oscillator",

    createGUI: async (context) => new OscillatorN3DGUI(context),

    create: async (context, gui) => new OscillatorN3D(context,gui),

}