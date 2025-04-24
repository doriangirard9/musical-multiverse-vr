import {WamConnectionPort} from "./WamConnectionPort.ts";
import {WamNode} from "@webaudiomodules/api";

class AudioInputPort extends WamConnectionPort {
    constructor(id: string, node: WamNode) {
        super(PortType.AUDIO_INPUT, id, node);
    }
}
class AudioOutputPort extends WamConnectionPort {
    constructor(id: string, node: WamNode) {
        super(PortType.AUDIO_OUTPUT, id, node);
    }
}
class MidiInputPort extends WamConnectionPort {
    constructor(id: string, node: WamNode) {
        super(PortType.MIDI_INPUT, id, node);
    }
}
class MidiOutputPort extends WamConnectionPort {
    constructor(id: string, node: WamNode) {
        super(PortType.MIDI_OUTPUT, id, node);
    }
}

export {AudioInputPort, AudioOutputPort, MidiInputPort, MidiOutputPort};