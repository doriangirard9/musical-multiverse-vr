

export namespace NoteUtils{

    export const DO = 0
    export const DO_SHARP = 1
    export const RE = 2
    export const RE_SHARP = 3
    export const MI = 4
    export const FA = 5
    export const FA_SHARP = 6
    export const SOL = 7
    export const SOL_SHARP = 8
    export const LA = 9
    export const LA_SHARP = 10
    export const SI = 11

    export const C = DO
    export const C_SHARP = DO_SHARP
    export const D = RE
    export const D_SHARP = RE_SHARP
    export const E = MI
    export const F = FA
    export const F_SHARP = FA_SHARP
    export const G = SOL
    export const G_SHARP = SOL_SHARP
    export const A = LA
    export const A_SHARP = LA_SHARP
    

    /** Get the note and octave from a midi number */
    export function midiToNote(midi: number): {note: number, octave: number} {
        return {note: midi % 12, octave: Math.floor(midi / 12) - 1}
    }


    /** Get the note and octave from a midi number and a specific gamme */
    export function midiToGammeNote(midi: number, gamme: number[]): {note: number, octave: number} {
        const localNote = midi % gamme.length
        const octave = Math.floor(midi / gamme.length) - 1
        return {note: gamme[localNote], octave}
    }


    /** Get the midi number from a note and octave */
    export function noteToMidi(note: number, octave: number): number {
        if(octave < -1) octave = -1
        if(octave > 8) octave = 8
        return (octave + 1) * 12 + note
    }

    /** Get the midi number from a midi number and a specific gamme */
    export function mapMidi(midi: number, gamme: number[]): number {
        const {note, octave} = midiToGammeNote(midi, gamme)
        return noteToMidi(note, octave)
    }


    /** Get the note name from a note number */
    export function noteToName(note: number): string {
        return NOTE_NAMES[note]
    }

    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

     
    /**  Get the full name from a midi number */
    export function midiToFullName(midi: number): string {
        const {note, octave} = midiToNote(midi)
        const noteName = noteToName(note)
        const noteNameLatin = noteToNameLatin(note)
        const percussionName = midiToPercussionName(midi)
        let total = `${noteName}/${noteNameLatin} ${octave} (${midi})`
        if(percussionName) total += ` - ${percussionName}`
        return total
    }


    /** Get the note name from a note number in latin notation */
    export function noteToNameLatin(note: number): string {
        return NOTE_NAMES_LATIN[note]
    }

    const NOTE_NAMES_LATIN = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"]


    /** Get the general midi percussion name from a midi number */
    export function midiToPercussionName(midi: number): string|undefined {
        if(midi < 35 || midi > 81) return undefined
        return PERCUSSION_NAMES[midi - 35]
    }

    const PERCUSSION_NAMES = [
        "Acoustic Bass Drum or Low Bass Drum",
        "Electric Bass Drum or High Bass Drum",
        "Side Stick",
        "Acoustic Snare",
        "Hand Clap",
        "Electric Snare or Rimshot",
        "Low Floor Tom",
        "Closed Hi-hat",
        "High Floor Tom",
        "Pedal Hi-hat",
        "Low Tom",
        "Open Hi-hat",
        "Low-Mid Tom",
        "High-Mid Tom",
        "Crash Cymbal 1",
        "High Tom",
        "Ride Cymbal 1",
        "Chinese Cymbal",
        "Ride Bell",
        "Tambourine",
        "Splash Cymbal",
        "Cowbell",
        "Crash Cymbal 2",
        "Vibraslap",
        "Ride Cymbal 2",
        "High Bongo",
        "Low Bongo",
        "Mute High Conga",
        "Open High Conga",
        "Low Conga",
        "High Timbale",
        "Low Timbale",
        "High Agogô",
        "Low Agogô",
        "Cabasa",
        "Maracas",
        "Short Whistle",
        "Long Whistle",
        "Short Güiro",
        "Long Güiro",
        "Claves",
        "High Woodblock",
        "Low Woodblock",
        "Mute Cuíca",
        "Open Cuíca",
        "Mute Triangle",
        "Open Triangle",
    ]


    // Gammes //
    export const GAMME_CHROMATIC = [DO, DO_SHARP, RE, RE_SHARP, MI, FA, FA_SHARP, SOL, SOL_SHARP, LA, LA_SHARP, SI]
    export const GAMME_C_MAJOR = [DO, RE, MI, FA, SOL, LA, SI]
    export const GAMME_C_MINOR = [DO, RE, RE_SHARP, FA, SOL, SOL_SHARP, LA_SHARP]
    export const GAMME_C_MINOR_HARMONIC = [DO, RE, RE_SHARP, FA, SOL, SOL_SHARP, SI]
    export const GAMME_C_MINOR_MELODIC = [DO, RE, RE_SHARP, FA, SOL, LA, SI]
    export const GAMME_C_DORIAN = [DO, RE, RE_SHARP, FA, SOL, LA, LA_SHARP]
    export const GAMME_C_PHRYGIAN = [DO, DO_SHARP, RE, FA, SOL, SOL_SHARP, LA_SHARP]

    // Gammes pentatoniques //
    export const GAMME_C_MAJOR_PENTATONIC = [DO, RE, MI, SOL, LA]
    export const GAMME_C_MINOR_PENTATONIC = [DO, RE_SHARP, FA, SOL, LA_SHARP]


    // Gamme selection //
    // TODO: Temporaire, il faudrait créer un système pour ça.

    export const GAMMES = [
        {notes: GAMME_CHROMATIC, label: "Chromatic"},
        {notes: GAMME_C_MAJOR, label: "C Major"},
        {notes: GAMME_C_MINOR, label: "C Minor"},
        {notes: GAMME_C_MINOR_HARMONIC, label: "C Minor Harmonic"},
        {notes: GAMME_C_MINOR_MELODIC, label: "C Minor Melodic"},
        {notes: GAMME_C_DORIAN, label: "C Dorian"},
        {notes: GAMME_C_PHRYGIAN, label: "C Phrygian"},
        {notes: GAMME_C_MAJOR_PENTATONIC, label: "C Major Pentatonic"},
        {notes: GAMME_C_MINOR_PENTATONIC, label: "C Minor Pentatonic"},
    ]
    
    let selectedGamme = 8

    export function getSelectedGammeIndex(): number {
        return selectedGamme
    }

    export function setSelectedGammeIndex(index: number) {
        selectedGamme = (index+GAMMES.length*10) % GAMMES.length
    }

    export function getSelectedGamme() {
        return GAMMES[selectedGamme]
    }

    export function mapWithSelectedGamme(midi: number): number {
        return mapMidi(midi, getSelectedGamme().notes)
    }

    // TODO: supprimer ça, c'est juste pour faire vite fait pratique
    export function getnote(n: number): number {
        const gamme = getSelectedGamme().notes
        const note = n % gamme.length
        const octave = Math.floor(n / gamme.length) - 1
        const midi = noteToMidi(gamme[note], octave)
        return midi + 12*3
    }

}