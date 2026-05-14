import type { Color4, AbstractMesh } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import type { Node3DGUIContext } from "../Node3DGUIContext";
import type { Node3DContext } from "../Node3DContext";



class SequencerN3DGUI implements Node3DGUI {

    root
    block
    notes: AbstractMesh[][] = []
    noteSliders: AbstractMesh[] = []
    output
    syncInput
    syncOutput
    notePadTemplate: AbstractMesh | null = null

    readonly stepCount = 12
    readonly noteCount = 8

    readonly NOTE_NAME: string[]
    readonly NODE_COLOR: Color4[]
    readonly ACTIVATED_COLOR: Color4
    readonly ON_COLOR: Color4
    readonly BASE_MIDI_NOTE = 48

    constructor(readonly context: Node3DGUIContext) {
        const {babylon:B,tools:T} = context

        this.root = new B.TransformNode("sequencer root", context.scene)

        this.NOTE_NAME = ["Do/C","Do#/C#","Re/D","Re#/D#", "Mi/E","Fa/F","Fa#/F#","Sol/G", "Sol#/G#","La/A","La#/A#","Si/B"]
        const WHITE = B.Color3.White().toColor4()
        const BLACK = B.Color3.Black().toColor4()
        this.NODE_COLOR = [WHITE, BLACK, WHITE, BLACK,  WHITE, WHITE, BLACK, WHITE,  BLACK, WHITE, BLACK, WHITE]
        this.ACTIVATED_COLOR = new B.Color4(1,1,0,1)
        this.ON_COLOR = new B.Color4(0,1,1,1)

        // Get dimensions
        const aspectRatio = this.stepCount/this.noteCount

        const [width,height] = (()=>{
            if(aspectRatio>1) return [1,1/aspectRatio]
            else return [aspectRatio,1]
        })()

        const baseSize = .5/Math.max(1, Math.min(this.stepCount, this.noteCount))

        // Create base
        const block = this.block = B.CreateBox("sequencer block", {width: width, height: baseSize, depth: height}, context.scene)
        T.MeshUtils.setColor(this.block, B.Color3.Blue().toColor4())
        block.material = context.materialMat
        block.position.y = -baseSize/2
        block.parent = this.root

        // Create output
        const output = this.output = T.ConnectableUtils.createOutputMesh("sequencer output", baseSize*1.7, context.scene)
        T.MeshUtils.setColor(output, T.MidiN3DConnectable.Color.toColor4())
        output.material = context.materialMat
        output.position.set(.5+baseSize*.7, -baseSize*.7, 0)
        output.parent = this.root

        // Create sync input
        const syncInput = this.syncInput = T.ConnectableUtils.createInputMesh("sequencer sync input", baseSize*1, context.scene)
        T.MeshUtils.setColor(syncInput, T.SynxN3DConnectable.Color.toColor4())
        syncInput.material = context.materialMat
        syncInput.position.set(-.5-baseSize*.7, -baseSize*.7, -.25)
        syncInput.parent = this.root

        // Create sync output
        const syncOutput = this.syncOutput = B.CreateIcoSphere("sequencer sync output", {radius:baseSize*.5}, context.scene)
        T.MeshUtils.setColor(syncOutput, T.SynxN3DConnectable.Color.toColor4())
        syncOutput.material = context.materialMat
        syncOutput.position.set(.5+baseSize*.7, -baseSize*.7, -.25)
        syncOutput.parent = this.root

        // Create notes
        const createKeyboard = (fx: number, fy: number, tx: number, ty: number)=>{
            const sx = tx-fx
            const sy = ty-fy

            const note_width = sx/(this.stepCount)
            const note_height = sy/(this.noteCount)
            const w = note_width*.9
            const h = note_height*.9
            
            // Create template mesh
            const template = B.CreateBox(`sequence note template`, {width: w, height: baseSize*.2, depth: h}, context.scene)
            template.material = context.materialMat
            template.isVisible = false
            template.parent = this.root
            
            // Register instanced buffer for colors
            template.registerInstancedBuffer("color", 4)
            template.instancedBuffers.color = new B.Color4(1, 1, 1, 1)
            
            this.notePadTemplate = template
            
            for(let s = 0; s<this.stepCount; s++){
                const step = [] as AbstractMesh[]
                this.notes.push(step)
                for(let n = 0; n<this.noteCount; n++){
                    const x = (s+.5)*note_width+fx
                    const y = ty-(n+.5)*note_height
                    const note_pad = template.createInstance(`sequence note ${n} step ${s}`)
                    step.push(note_pad)
                    this.colorize(s, n, this.BASE_MIDI_NOTE+n, false, false)
                    note_pad.position.set(x,baseSize*.1,y)
                }
            }
            for(let n = 0; n<this.noteCount; n++){
                const x = fx - baseSize*.7
                const y = ty-(n+.5)*note_height
                const slider = B.CreateSphere(`sequence note slider ${n}`, {diameter: h}, context.scene)
                slider.position.set(x,baseSize*.1,y)
                slider.parent = this.root
                this.noteSliders.push(slider)
            }
        }

        createKeyboard(
            -width/2 +baseSize*.2 + baseSize*1.5 +baseSize*.2,
            -height/2 +baseSize*.2,
            width/2 -baseSize*.2,
            height/2 -baseSize*.2,
        )
    }

    getNodePad(step: number, note: number){
        return this.notes[step][note] 
    }

    colorize(step: number, note: number, midiNote: number, isOn: boolean, isActivated: boolean){
        const {babylon:B} = this.context
        let color = new B.Color4(1,1,1,1)
        if(isOn) color.multiplyInPlace(this.ACTIVATED_COLOR)
        if(isActivated) color.multiplyInPlace(this.ON_COLOR)
        color.addInPlace(this.NODE_COLOR[(midiNote)%12]).scaleInPlace(.5)
        
        const instance = this.getNodePad(step, note)
        instance.instancedBuffers.color = color
    }

    async dispose(): Promise<void> {
        this.root.dispose()
        this.notes = []
    }

    get worldSize() { return 5 }
}

class SequencerN3D implements Node3D{

    // Actual State
    private notes_state = [] as boolean[][]
    private notes_midi = [] as number[]

    private currentStep = -1

    private sync

    private midi_output

    // Update note data and visual
    private updateNote(step: number, note: number) {
        let isActivated = this.currentStep==step
        let isOn = this.notes_state[step][note]
        let midiNote = this.notes_midi[note]

        this.gui.colorize(step, note, midiNote, isOn, isActivated)
    }

    private set_on(step:number,note:number,value:boolean){
        this.notes_state[step][note] = value
        this.updateNote(step, note)
    }

    private set_midi(note:number, midiNote: number){
        this.notes_midi[note] = midiNote
        for(let s=0; s<this.notes_state.length; s++){
            this.updateNote(s, note)
        }
    }

    private updateStep(gui: SequencerN3DGUI, audioContext: AudioContext){
        const loop = (audioContext.currentTime%this.sync.total)
        const local = (loop-this.sync.start)/this.sync.duration

        let newStep
        if(local>=0 && local<1) newStep = Math.floor(local*this.notes_state.length)
        else newStep = -1

        if(newStep != this.currentStep){
            const oldStep = this.currentStep
            this.currentStep = newStep
            for(let n=0; n<this.notes_state[0].length; n++){
                if(oldStep!=-1) this.updateNote(oldStep, n)
                if(newStep!=-1) {
                    this.updateNote(newStep, n)
                    if(this.notes_state[newStep][n]){
                        const note = this.notes_midi[n]
                        this.sendNote(audioContext, note, 100, this.sync.duration/this.notes_state.length*0.9)
                    }
                }
            }
        }
    }

    private sendNote(audioContext: AudioContext, note: number, velocity: number, duration: number){
        console.log("Send note", note, "velocity", velocity, "duration", duration)
        for(const cn of this.midi_output.connections){
            cn.scheduleEvents({ type:'wam-midi', time: audioContext.currentTime, data: { bytes: [0x90, note, velocity] } })
            cn.scheduleEvents({ type:'wam-midi', time: audioContext.currentTime + duration, data: { bytes: [0x80, note, 0] } })
        }
    }

    constructor(context: Node3DContext, private gui: SequencerN3DGUI){
        const {tools:T} = context
        const sequencer = this

        context.addToBoundingBox(gui.block)

        // Create note array
        this.notes_midi = Array.from({length: gui.stepCount}, (_,i)=>gui.BASE_MIDI_NOTE + i)

        // Create midi output
        const midi_output = this.midi_output = new T.MidiN3DConnectable.ListOutput("midioutput", [gui.output], "MIDI Output")
        context.createConnectable(midi_output)

        // Sync
        this.sync = new T.SynxN3DConnectable.Container(5)
        context.createConnectable(new T.SynxN3DConnectable.Input("syncInput", [gui.syncInput], "Sync Input", this.sync))
        context.createConnectable(new T.SynxN3DConnectable.Output("syncOutput", [gui.syncOutput], "Sync Output", this.sync))

        // Create note buttons
        for(let s=0; s<gui.notes.length; s++){
            const step_note_states = [] as boolean[]
            this.notes_state.push(step_note_states)
            for(let n=0; n<gui.notes[s].length; n++){
                step_note_states.push(false)
                const note_pad = gui.getNodePad(s, n)
                context.createParameter({
                    id: `sequencer_note_${n}_${s}`,
                    meshes: [note_pad],
                    getLabel() { return `${gui.NOTE_NAME[sequencer.notes_midi[n]%12]} n°${s+1}` },
                    getStepCount() { return 2 },
                    getValue() { return step_note_states[n] ? 1 : 0 },
                    setValue(v){ sequencer.set_on(s, n, v<.5 ? false : true) },
                    stringify(v) { return v<.5 ? "Off" : "On" },
                })
                sequencer.set_on(s, n, false)
            }
        }

        // Create note sliders
        for(let n=0; n<gui.noteSliders.length; n++){
            const slider = gui.noteSliders[n]
            let midi_to_v = (v: number) => v/128
            let v_to_midi = (v: number) => Math.min(127, Math.max(0, Math.floor(v*128)))
            context.createParameter({
                id: `sequencer_note_midi_${n}`,
                meshes: [slider],
                getLabel() { return `Note ${n+1}` },
                getStepCount() { return 128 },
                getValue() { return midi_to_v(sequencer.notes_midi[n]) },
                setValue(v){ sequencer.set_midi(n, v_to_midi(v)) },
                stringify(v) { return `${gui.NOTE_NAME[v_to_midi(v)%12]}` },
            })
            sequencer.set_midi(n, sequencer.notes_midi[n])
        }

        const interval = setInterval(()=>{
            sequencer.updateStep(gui, context.audioCtx)
        },5)

        this.dispose = async ()=>{
            clearInterval(interval)
        }
    }

    async setState(key: string, state: any): Promise<void> { }

    async getState(key: string): Promise<any> { }

    getStateKeys(): string[] { return []}

    dispose!: ()=>Promise<void>

}

export const SequencerN3DFactory: Node3DFactory<SequencerN3DGUI,SequencerN3D> = {

    label: "Sequencer",

    description: "A simple sequencer that can be used to create patterns of MIDI notes. ",

    tags: ["sequencer", "midi", "generator", "pattern"],
    
    async createGUI(context) { return new SequencerN3DGUI(context) },

    async create(context, gui) { return new SequencerN3D(context,gui) },

}