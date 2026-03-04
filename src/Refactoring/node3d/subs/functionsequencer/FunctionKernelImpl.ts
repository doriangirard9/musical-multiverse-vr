import { WamEvent } from "@webaudiomodules/api"
import { FunctionKernel } from "./FunctionKernel"
import { NoteDefinition, ParameterDefinition } from "./FunctionAPI"
import { RemoteUIElement } from "./RemoteUI"
import { MidiEventManager } from "./MidiEventManager"

/**
 * Implémentation concrète du FunctionKernel pour le Node3D
 */
export class FunctionKernelImpl implements FunctionKernel {
    
    private _tempo: number = 120
    private _parameterIds: string[] = []
    private parameters: Map<string, ParameterDefinition> = new Map()
    private parameterValues: Map<string, number> = new Map()
    private additionalState: Map<string, any> = new Map()
    private currentUI: RemoteUIElement | null = null
    private noteList: NoteDefinition[] | undefined = undefined

    // Callbacks
    private onHighlightCallback: ((name: string, value: boolean) => void) | null = null
    private onEmitEventCallback: ((event: WamEvent) => void) | null = null
    private onUIChangeCallback: ((ui: RemoteUIElement) => void) | null = null
    private onParametersChangeCallback: ((params: ParameterDefinition[]) => void) | null = null
    private onNoteListChangeCallback: ((noteList?: NoteDefinition[]) => void) | null = null
    private onStateChangeCallback: ((state: Map<string, any>) => void) | null = null

    constructor(
        private midiEventManager: MidiEventManager,
        initialTempo: number = 120
    ) {
        this._tempo = initialTempo
    }

    // Implémentation de FunctionKernel

    highlight(name: string, value: boolean): void {
        if (this.onHighlightCallback) {
            this.onHighlightCallback(name, value)
        }
    }

    emitEvents(...events: WamEvent[]): void {
        for (const event of events) {
            // Programmer l'événement MIDI via le MidiEventManager
            if (event.type === 'wam-midi' && event.data?.bytes) {
                this.midiEventManager.scheduleEvent(event.data.bytes, event.time || 0)
            }
            
            // Notifier via callback
            if (this.onEmitEventCallback) {
                this.onEmitEventCallback(event)
            }
        }
    }

    setNotelist(noteList?: NoteDefinition[]): void {
        this.noteList = noteList
        if (this.onNoteListChangeCallback) {
            this.onNoteListChangeCallback(noteList)
        }
    }

    registerParameters(parameters: ParameterDefinition[]): void {
        this.parameters.clear()
        this._parameterIds = []
        
        for (const param of parameters) {
            this.parameters.set(param.id, param)
            this._parameterIds.push(param.id)
            
            // Initialiser avec la valeur par défaut si elle existe
            if (param.config.defaultValue !== undefined) {
                this.parameterValues.set(param.id, param.config.defaultValue)
            }
        }

        if (this.onParametersChangeCallback) {
            this.onParametersChangeCallback(parameters)
        }
    }

    registerUI(element: RemoteUIElement): void {
        this.currentUI = element
        if (this.onUIChangeCallback) {
            this.onUIChangeCallback(element)
        }
    }

    setAdditionalState(name: string, value: any): void {
        this.additionalState.set(name, value)
        if (this.onStateChangeCallback) {
            this.onStateChangeCallback(this.additionalState)
        }
    }

    getAdditionalState(name: string): any {
        return this.additionalState.get(name)
    }

    get tempo(): number {
        return this._tempo
    }

    set tempo(value: number) {
        this._tempo = value
    }

    get parameterIds(): string[] {
        return [...this._parameterIds]
    }

    getParameterState(id: string): number {
        return this.parameterValues.get(id) ?? 0
    }

    // Méthodes publiques supplémentaires

    /**
     * Définit la valeur d'un paramètre
     */
    setParameterValue(id: string, value: number): void {
        if (this.parameters.has(id)) {
            this.parameterValues.set(id, value)
        }
    }

    /**
     * Récupère tous les paramètres enregistrés
     */
    getParameters(): ParameterDefinition[] {
        return Array.from(this.parameters.values())
    }

    /**
     * Récupère l'UI courante
     */
    getCurrentUI(): RemoteUIElement | null {
        return this.currentUI
    }

    /**
     * Récupère la note list courante
     */
    getNoteList(): NoteDefinition[] | undefined {
        return this.noteList
    }

    /**
     * Récupère tout l'état additionnel
     */
    getAllAdditionalState(): Record<string, any> {
        const state: Record<string, any> = {}
        this.additionalState.forEach((value, key) => {
            state[key] = value
        })
        return state
    }

    /**
     * Charge l'état additionnel depuis un objet
     */
    loadAdditionalState(state: Record<string, any>): void {
        this.additionalState.clear()
        for (const [key, value] of Object.entries(state)) {
            this.additionalState.set(key, value)
        }
    }

    // Méthodes pour définir les callbacks

    setHighlightCallback(callback: (name: string, value: boolean) => void): void {
        this.onHighlightCallback = callback
    }

    setEmitEventCallback(callback: (event: WamEvent) => void): void {
        this.onEmitEventCallback = callback
    }

    setUIChangeCallback(callback: (ui: RemoteUIElement) => void): void {
        this.onUIChangeCallback = callback
    }

    setParametersChangeCallback(callback: (params: ParameterDefinition[]) => void): void {
        this.onParametersChangeCallback = callback
    }

    setNoteListChangeCallback(callback: (noteList?: NoteDefinition[]) => void): void {
        this.onNoteListChangeCallback = callback
    }

    setStateChangeCallback(callback: (state: Map<string, any>) => void): void {
        this.onStateChangeCallback = callback
    }

    /**
     * Réinitialise le kernel
     */
    reset(): void {
        this.parameters.clear()
        this.parameterValues.clear()
        this.additionalState.clear()
        this._parameterIds = []
        this.currentUI = null
        this.noteList = undefined
    }
}
