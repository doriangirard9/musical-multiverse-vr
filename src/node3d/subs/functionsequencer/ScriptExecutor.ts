import { FunctionSequencer, NoteDefinition } from "./FunctionAPI"
import { WamTransportData } from "@webaudiomodules/api"

/**
 * Gère l'exécution du script JavaScript utilisateur et les callbacks du séquenceur
 */
export class ScriptExecutor {
    
    private sequencerInstance: FunctionSequencer | null = null
    private scriptCode: string = ""
    private lastError: Error | null = null

    constructor() {}

    /**
     * Charge et compile un nouveau script
     */
    loadScript(code: string): { success: boolean; error?: Error } {
        this.scriptCode = code
        this.sequencerInstance = null
        this.lastError = null

        try {
            // Créer une fonction qui retourne l'instance du séquenceur
            // Vérifier que le script compile correctement
            new Function('api', 'ui', 'tonal', this.scriptCode)
            
            // Note: api et ui seront passés lors de l'initialisation
            return { success: true }
        } catch (error) {
            this.lastError = error as Error
            console.error("Script compilation error:", error)
            return { success: false, error: error as Error }
        }
    }

    /**
     * Initialise le script avec l'api et l'ui
     */
    initialize(api: any, ui: any): { success: boolean; error?: Error } {
        try {
            // Exécuter le script avec l'API et l'UI
            const scriptFunction = new Function('api', 'ui', 'tonal', this.scriptCode)
            this.sequencerInstance = scriptFunction(api, ui, {})

            if (!this.sequencerInstance) {
                throw new Error("Script must return a FunctionSequencer instance")
            }

            // Appeler init si disponible
            if (this.sequencerInstance.init) {
                this.sequencerInstance.init()
            }

            return { success: true }
        } catch (error) {
            this.lastError = error as Error
            console.error("Script initialization error:", error)
            return { success: false, error: error as Error }
        }
    }

    /**
     * Appelle onTick sur le script si disponible
     */
    onTick(tick: number): void {
        if (!this.sequencerInstance) return
        
        try {
            if (this.sequencerInstance.onTick) {
                this.sequencerInstance.onTick(tick)
            }
        } catch (error) {
            console.error("Error in onTick:", error)
            this.lastError = error as Error
        }
    }

    /**
     * Appelle onMidi sur le script si disponible
     */
    onMidi(bytes: number[]): void {
        if (!this.sequencerInstance) return
        
        try {
            if (this.sequencerInstance.onMidi) {
                this.sequencerInstance.onMidi(bytes)
            }
        } catch (error) {
            console.error("Error in onMidi:", error)
            this.lastError = error as Error
        }
    }

    /**
     * Appelle onTransportStart sur le script si disponible
     */
    onTransportStart(transport: WamTransportData): void {
        if (!this.sequencerInstance) return
        
        try {
            if (this.sequencerInstance.onTransportStart) {
                this.sequencerInstance.onTransportStart(transport)
            }
        } catch (error) {
            console.error("Error in onTransportStart:", error)
            this.lastError = error as Error
        }
    }

    /**
     * Appelle onTransportStop sur le script si disponible
     */
    onTransportStop(transport: WamTransportData): void {
        if (!this.sequencerInstance) return
        
        try {
            if (this.sequencerInstance.onTransportStop) {
                this.sequencerInstance.onTransportStop(transport)
            }
        } catch (error) {
            console.error("Error in onTransportStop:", error)
            this.lastError = error as Error
        }
    }

    /**
     * Appelle onAction sur le script si disponible
     */
    onAction(name: string): void {
        if (!this.sequencerInstance) return
        
        try {
            if (this.sequencerInstance.onAction) {
                this.sequencerInstance.onAction(name)
            }
        } catch (error) {
            console.error("Error in onAction:", error)
            this.lastError = error as Error
        }
    }

    /**
     * Appelle onStateChange sur le script si disponible
     */
    onStateChange(state: Record<string, any>): void {
        if (!this.sequencerInstance) return
        
        try {
            if (this.sequencerInstance.onStateChange) {
                this.sequencerInstance.onStateChange(state)
            }
        } catch (error) {
            console.error("Error in onStateChange:", error)
            this.lastError = error as Error
        }
    }

    /**
     * Appelle onCustomNoteList sur le script si disponible
     */
    onCustomNoteList(noteList?: NoteDefinition[]): void {
        if (!this.sequencerInstance) return
        
        try {
            if (this.sequencerInstance.onCustomNoteList) {
                this.sequencerInstance.onCustomNoteList(noteList)
            }
        } catch (error) {
            console.error("Error in onCustomNoteList:", error)
            this.lastError = error as Error
        }
    }

    /**
     * Récupère la dernière erreur
     */
    getLastError(): Error | null {
        return this.lastError
    }

    /**
     * Vérifie si le script est chargé et initialisé
     */
    isReady(): boolean {
        return this.sequencerInstance !== null
    }

    /**
     * Réinitialise l'exécuteur
     */
    reset(): void {
        this.sequencerInstance = null
        this.scriptCode = ""
        this.lastError = null
    }
}
