
// Write a MIDI sequencer in ES6 javascript.
// Press "Run" to load changes.  This also distributes changes to other users.
// It is loaded directly into the browser's audio thread, no transpilation occurs.
// For better error reporting check your console.

/*
 Your Sequencer class implements various callback functions that the host will call when the events occur.
 For example, `onTick` is called 96 times every quarter note.  
              `onTransportStart` is called when the 'play' button is pressed.
              etc..

 There is an `api` object in scope that your script can call to perform various functions, such as:
 - register a list of parameters for automation
 - emit MIDI events

 There is also a `ui` object in scope that you call for various UI-related functions, such as:
 - register a custom UI
 - highlight UI elements

 Lastly, there is an object in scope called 'tonal' which is the tonal js library.  This is useful for working
 with intervals, chords, and scales.  See https://github.com/tonaljs/tonal for details.

*/

/** 
 * @class
 * @implements {FunctionSequencer}
 * */
class SimpleStepSequencer {
    constructor() {   
        this.lastStep = []
    }

    init() {
        /**
         * @type {ParameterDefinition[]}
         */
        let params = []

        let uiRows = []

        if (!this.noteList) {
            api.registerUI(ui.Label("Connect to MIDI device with custom note list (for example DRM-16 Drum Machine!)"))
            return
        }

        for (let i = 0; i < this.noteList.length; i++) {
            let rowLength = api.getState(`rowLen${i}`) || 8
            let uiRow = []
            uiRow.push(ui.Label(this.noteList[i].name, {width: 120, height: 30}))
            uiRow.push(ui.Row(`buttons${i}`, [ui.Action(`add${i}`, {label:"+"}), ui.Action(`del${i}`, {label: "-"})], {width: 80, height: 40, padding: 0}))

            for (let j = 0; j < rowLength; j++) {
                params.push(
                    {
                        id: `step${i}-${j}`,
                        config: {
                            label: `${this.noteList[i].name} Step ${j+1}`,
                            type: "boolean",
                            defaultValue: 0
                        }
                    }
                )

                uiRow.push(ui.Toggle(`step${i}-${j}`, {width: 30, height: 30}))
            }

            uiRows.push(ui.Row(`row${i}`, uiRow))
        }

        // this call updates the parameter list exposed by the plugin.
        api.registerParameters(params)

        api.registerUI(ui.Col('main', uiRows))
    }

    /**
     * @param {number} tick - a monotonically increasing count, 96 ticks = 1 beat.
     * @param {Record<string, number>} params
     * */
    onTick(tick) {
        const params = api.getParams()
        
        const cumulativeStep = Math.floor(tick / 24)
        if (!this.noteList) {
            return
        }

        const duration = api.getTickDuration(20)

        for (let i = 0; i < this.noteList.length; i++) {
            let rowLength = api.getState(`rowLen${i}`) || 8
            const step = cumulativeStep % rowLength

            if (step != this.lastStep[i]) {
                this.lastStep[i] = step
            
                if (step > 0) {
                    ui.Highlight(`step${i}-${step-1}`, false)
                } else {
                    ui.Highlight(`step${i}-${rowLength-1}`, false)
                }
                ui.Highlight(`step${i}-${step}`, true)
            

                if (params[`step${i}-${step}`] != 0) {
                    api.emitNote(0, this.noteList[i].number, 100, duration)
                }
            }
        }
    }

    /**
     * Called when a downstream device updates the list of MIDI notes it responds to.  Especially useful for drum machines.
     * @param noteList {NoteDefinition[]} An optional list of MIDI note numbers, with names, supported by downstream MIDI devices
     */
    onCustomNoteList(noteList) {
        /**
         * @type {NoteDefinition[]}
         */
        this.noteList = noteList
        console.log("Custom note list received: ", noteList)
        
        this.init()
    }

    /** 
     * onMidi is called when a MIDI message is sent to the FunctionSeq instance.
     * @param bytes {number[]}
     * */
    onMidi(bytes) {
        // pass any incoming midi events through to the output
        api.emitMidiEvent(bytes, 0)
    }

    /**
     * Called when the host transport stops playing.
     * @param transport {WamTransportData} the transport state, including tempo, time signature, and playing state
     */
    onTransportStop() {
    }

    /**
     * Called when the host transport starts playing.
     * @param transport {WamTransportData} the transport state, including tempo, time signature, and playing state
     */
    onTransportStart() {
    }

    /**
     * Called when an 'action' button has been pressed.
     * @param name {string} the name of the registered action that has been pressed
     */
    onAction(name) {
        if (name.startsWith("add")) {
            let row = parseInt(name.replace("add", ""))
            api.setState(`rowLen${row}`, (api.getState(`rowLen${row}`) || 8) + 1)
        } else if (name.startsWith("del")) {
            let row = parseInt(name.replace("del", ""))
            let val = (api.getState(`rowLen${row}`) || 8) - 1
            if (val < 1) {
                val = 1
            }
            api.setState(`rowLen${row}`, val)
        }
    }

    /**
     * Called when an extra piece of state is set with 'api.setState', either locally
     * or remotely from some other collaborator.
     */
    onStateChange(state) {        
        // in our case this happens when 'addStep' or 'deleteStep' buttons are pressed
        // and a new value of `stepCount` has been set.

        // time to re-register the parameter list and UI to match the number of steps
        this.init()
    }
}

// this script must return a single instance of the new sequencer.
return new SimpleStepSequencer()
