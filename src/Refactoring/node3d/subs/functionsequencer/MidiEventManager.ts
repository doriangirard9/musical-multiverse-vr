/**
 * Événement MIDI programmé avec son temps d'émission
 */
type ScheduledMidiEvent = {
    time: number
    bytes: number[]
}

/**
 * Gère les événements MIDI programmés et leur émission au bon moment
 */
export class MidiEventManager {
    
    private scheduledEvents: ScheduledMidiEvent[] = []
    private onEmitCallback: ((bytes: number[]) => void) | null = null
    private currentTime: number = 0
    private isRunning: boolean = false

    constructor() {}

    /**
     * Définit le callback pour émettre les événements MIDI
     */
    setEmitCallback(callback: (bytes: number[]) => void): void {
        this.onEmitCallback = callback
    }

    /**
     * Programme un événement MIDI pour émission ultérieure
     */
    scheduleEvent(bytes: number[], eventTime: number): void {
        this.scheduledEvents.push({
            time: eventTime,
            bytes: [...bytes]
        })
        
        // Trier les événements par temps
        this.scheduledEvents.sort((a, b) => a.time - b.time)
    }

    /**
     * Programme une note MIDI (note on + note off)
     */
    scheduleNote(
        channel: number,
        note: number,
        velocity: number,
        duration: number,
        startTime: number
    ): void {
        // Note On
        this.scheduleEvent([0x90 | channel, note, velocity], startTime)
        // Note Off
        this.scheduleEvent([0x80 | channel, note, velocity], startTime + duration)
    }

    /**
     * Met à jour le temps courant et émet les événements prêts
     */
    update(currentTime: number): void {
        if (!this.isRunning || !this.onEmitCallback) return

        this.currentTime = currentTime

        // Émettre tous les événements dont le temps est dépassé
        while (this.scheduledEvents.length > 0) {
            const nextEvent = this.scheduledEvents[0]
            
            if (nextEvent.time <= currentTime) {
                this.scheduledEvents.shift()
                this.onEmitCallback(nextEvent.bytes)
            } else {
                break
            }
        }
    }

    /**
     * Démarre l'émission des événements
     */
    start(): void {
        this.isRunning = true
    }

    /**
     * Arrête l'émission et nettoie les événements programmés
     */
    stop(): void {
        this.isRunning = false
        this.clearScheduledEvents()
    }

    /**
     * Arrête sans nettoyer les événements (pause)
     */
    pause(): void {
        this.isRunning = false
    }

    /**
     * Reprend l'émission
     */
    resume(): void {
        this.isRunning = true
    }

    /**
     * Efface tous les événements programmés
     */
    clearScheduledEvents(): void {
        this.scheduledEvents = []
    }

    /**
     * Obtient le nombre d'événements en attente
     */
    getPendingEventCount(): number {
        return this.scheduledEvents.length
    }

    /**
     * Vérifie si le manager est en train de tourner
     */
    getIsRunning(): boolean {
        return this.isRunning
    }

    /**
     * Obtient le temps courant
     */
    getCurrentTime(): number {
        return this.currentTime
    }

    /**
     * Émet immédiatement un événement MIDI
     */
    emitImmediate(bytes: number[]): void {
        if (this.onEmitCallback) {
            this.onEmitCallback(bytes)
        }
    }

    /**
     * Réinitialise le manager
     */
    reset(): void {
        this.stop()
        this.currentTime = 0
        this.scheduledEvents = []
    }
}
