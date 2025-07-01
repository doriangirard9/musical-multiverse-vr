import { controls, WamGUIGenerator, WAMGuiInitCode, ControlStateManager } from "wam3dgenerator";
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DGUIContext } from "../Node3DGUIContext";
import type { Node3DContext } from "../Node3DContext";
import { AbstractMesh } from "@babylonjs/core";
import { WamDescriptor } from "@webaudiomodules/api";


class Wam3DGeneratorN3DGui implements Node3DGUI{

    root
    wam_generator!: WamGUIGenerator

    get worldSize(){ return .8/this.wam_generator.calculateAverageControlSize() }

    constructor(context: Node3DGUIContext){
        const {babylon:B} = context
        this.root = new B.TransformNode("wam3d generator root", context.scene)

    }

    async init(guicode: WAMGuiInitCode){
        this.wam_generator = await WamGUIGenerator.create({
            babylonjs:{
                root: this.root,
                defineAnInput(){},
                defineAnOutput(){},
                defineAnEventInput(){},
                defineAnEventOutput(){},
                defineField(){},
                defineDraggableField(){}
            }
        })
        await this.wam_generator.load(guicode,controls)
    }

    async dispose(): Promise<void> {
        this.wam_generator.dispose()
        this.root.dispose()
    }
}

class Wam3DGeneratorN3D implements Node3D{

    states!: ControlStateManager

    constructor(){}

    async init(context: Node3DContext, guicode: WAMGuiInitCode, gui: Wam3DGeneratorN3DGui){
        const {tools:T} = context

        let count = 0
        gui.wam_generator.dispose()
        gui.wam_generator = await WamGUIGenerator.create_and_init({
            babylonjs:{
                root: gui.root,
                defineField(settings) {
                    context.createParameter({
                        id: settings.getName(),
                        meshes: settings.target,
                        getLabel() { return settings.getName() },
                        getStepCount() { return settings.getStepCount() },
                        getValue() { return settings.getValue() },
                        setValue(value) { settings.setValue(value) },
                        stringify(value) { return settings.stringify(value) },
                    })
                },
                defineAnInput(settings) {
                    count++
                    context.createConnectable(new T.AudioN3DConnectable.Input(
                        `audioinput${count}`,
                        settings.target,
                        "Audio Input",
                        settings.node
                    ))
                },
                defineAnOutput(settings) {
                    count++
                    context.createConnectable(new T.AudioN3DConnectable.Output(
                        `audiooutput${count}`,
                        settings.target,
                        "Audio Output",
                        settings.node
                    ))
                },
                defineAnEventInput(settings) {
                    count++
                    context.createConnectable(new T.MidiN3DConnectable.Input(
                        `midiinput${count}`,
                        settings.target,
                        "Midi Input",
                        settings.node
                    ))
                },
                defineAnEventOutput(settings) {
                    count++
                    context.createConnectable(new T.MidiN3DConnectable.Output(
                        `midioutput${count}`,
                        settings.target,
                        "Midi Output",
                        settings.node
                    ))
                },
                defineDraggableField(_) { },
            }
        },guicode,controls,context.audioCtx,context.groupId)
        this.states = new ControlStateManager(gui.wam_generator.controls)
        this.states.onStateChange = name => context.notifyStateChange(name)
        context.addToBoundingBox(gui.wam_generator.pad_node as AbstractMesh)
    }

    async dispose(): Promise<void> {
        this.states.dispose()
    }

    async getState(name: string): Promise<any> {
        return await this.states.get(name)
    }

    async setState(name: string, value: any): Promise<void> {
        await this.states.set(name, value)
    }

    getStateKeys(): string[] {
        return [...this.states.names]
    }

}

export class Wam3DGeneratorN3DFactory implements Node3DFactory<Wam3DGeneratorN3DGui,Wam3DGeneratorN3D>{

    constructor(
        readonly label: string,
        readonly description: string,
        readonly tags: string[],
        private code: WAMGuiInitCode
    ){}

    static async create(code: WAMGuiInitCode){
        const {wam_url} = code
        const descriptor_url = wam_url.substring(0,wam_url.lastIndexOf("/"))+"/descriptor.json"
        const descriptor = (await(await fetch(descriptor_url)).json()) as WamDescriptor
        const tags = new Set<string>(descriptor.keywords.map(k=>k.toLowerCase()))
        if(descriptor.isInstrument) tags.add("instrument")
        return new Wam3DGeneratorN3DFactory(
            descriptor.name,
            descriptor.description,
            [...tags],
            code
        )
    }

    async createGUI(context: Node3DGUIContext): Promise<Wam3DGeneratorN3DGui> {
        const gui = new Wam3DGeneratorN3DGui(context)
        await gui.init(this.code)
        return gui
    }

    async create(context: Node3DContext, gui: Wam3DGeneratorN3DGui): Promise<Wam3DGeneratorN3D> {
        const node = new Wam3DGeneratorN3D()
        await node.init(context, this.code, gui)
        return node
    }

}