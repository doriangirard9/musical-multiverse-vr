import * as B from "@babylonjs/core";
import { Instrument3D } from "../Instrument3D.ts";
import { IAudioNodeConfig, IWamConfig } from "../types.ts";
import { SamplerSettingsMenu } from "./SamplerSettingsMenu.ts";
import { PresetManager } from "./PresetManager.ts";
import {PatternDelegate, PatternEntry, PatternExtension} from "../../wamExtension/patterns/PatternExtension.ts";
import {NoteDefinition, NoteExtension} from "../../wamExtension/notes/NoteExtension.ts";
import {AudioEventPayload} from "../../AudioEvents.ts";

// Interface pour représenter un pattern dans le sampler
interface SamplerPattern {
    id: string;
    name: string;
    sequence: Array<{
        midiNote: number;
        time: number;
        duration: number;
        velocity: number;
    }>;
}

export class WamSampler3D extends Instrument3D implements PatternDelegate {
    // Grid pour stocker les boutons et les notes associées
    private _grid: { mesh: B.Mesh; isActivated: boolean; midiNote: number; samplePlayer?: AudioBufferSourceNode }[][] = [];
    // Menu de paramètres pour le sampler, sert à changer les presets et gérer les patterns
    private _settingsMenu: SamplerSettingsMenu;
    // Map pour stocker les effets audio chargés
    private _sampleBuffers: Map<number, AudioBuffer> = new Map();
    // Sortie audio des échantillons permet de connecter à d'autres wam
    private _outputNode: GainNode;
    private _currentPreset = "Basic Kit"; // Preset par défaut
    // WAM Extensions
    private _noteExtension: NoteExtension | undefined;
    private _patternExtension: PatternExtension | undefined;
    private _patterns: Map<string, SamplerPattern> = new Map();
    private _currentPattern: string | undefined;
    private _currentSequenceTimeout: number | undefined;
    private _recordingEnabled: boolean = false;
    private _recordingStartTime: number = 0;
    private _isPlaying: boolean = false;
    private _recordButton: B.Mesh | null = null;

    constructor(scene: B.Scene, audioCtx: AudioContext, id: string, config: IWamConfig, configFile: IAudioNodeConfig) {
        super(scene, audioCtx, id, config, configFile);
        this._settingsMenu = new SamplerSettingsMenu(this._scene, this);

        // Créer un nœud de gain qui servira de point de sortie pour tous les effets audio
        this._outputNode = this._audioCtx.createGain();
        this._outputNode.gain.value = 1.0;

        // Initialiser les extensions WAM si elles existent
        this._initWAMExtensions();

        this.eventBus.on('WAM_SAMPLER_NOTE_TRIGGER', (payload: AudioEventPayload['WAM_SAMPLER_NOTE_TRIGGER']) => {
            if (payload.nodeId == this.id) {
                this._playSample(payload.midiNote, payload.velocity / 127, false);
                const row = Math.floor((payload.midiNote - 60) / 4);
                const col = (payload.midiNote - 60) % 4;
                if (row >= 0 && row < 4 && col >= 0 && col < 4) {
                    this._grid[row][col].isActivated = true;
                    this._updateNoteColor(row, col);
                }
            }
        });
    }

    protected async instantiate(): Promise<void> {
        await super.instantiate();
        this._createGrid();
        this._createSettingsButton();
        this._createRecordingButton(); // Ajout du bouton d'enregistrement rapide
        this._positionIOConnectors();
        //await this.loadPreset(PresetManager.presets[0].name,true); // Preset par défaut Basic Drum
        await this._loadPresetFromNetwork();
        // Initialisation des notes disponibles
        this._initNoteDefinitions();

        console.log("WamSampler3D instantiated.");
    }
    private async _loadPresetFromNetwork(): Promise<void> {
        return new Promise((resolve) => {
            // Définir un timeout pour éviter un blocage si aucune réponse n'arrive
            const timeoutId = setTimeout(() => {
                this.loadPreset(PresetManager.presets[0].name, true);
                this.eventBus.off('WAM_SAMPLER_PRESET_RESPONSE', responseHandler);
                resolve();
            }, 2000);

            // Fonction qui gère la réponse
            const responseHandler = (payload: AudioEventPayload['WAM_SAMPLER_PRESET_RESPONSE']) => {
                if (payload.nodeId === this.id) {
                    clearTimeout(timeoutId);

                    if (payload.preset) {
                        // Charger le preset du réseau (sans propager l'événement)
                        this.loadPreset(payload.preset, false);
                        console.log(`Preset réseau chargé pour ${this.id}: ${payload.preset}`);
                    } else {
                        // Aucun preset trouvé, charger le preset par défaut
                        this.loadPreset(PresetManager.presets[0].name, true);
                    }

                    this.eventBus.off('WAM_SAMPLER_PRESET_RESPONSE', responseHandler);
                    resolve();
                }
            };
            // wait for everythign to be ready
            this.eventBus.on('WAM_SAMPLER_PRESET_RESPONSE', responseHandler);
            this.eventBus.emit('WAM_SAMPLER_GET_PRESET', { nodeId: this.id });
        });
    }
    /* Méthode pour initialiser les extensions WAM
     * - Normalement, ces extensions sont déjà créé dans App.ts
     * - C'est juste au cas où elles ne sont pas disponibles
     */
    private _initWAMExtensions(): void {
        if (window.WAMExtensions) {
            // Initialiser l'extension Notes
            if (!window.WAMExtensions.notes) {
                window.WAMExtensions.notes = new NoteExtension();
            }
            this._noteExtension = window.WAMExtensions.notes;

            // Initialiser l'extension Patterns
            if (!window.WAMExtensions.patterns) {
                window.WAMExtensions.patterns = new PatternExtension();
            }
            this._patternExtension = window.WAMExtensions.patterns;

            // Enregistrer ce sampler comme délégué de pattern
            this._patternExtension.setPatternDelegate(this.id, this);

            console.log("WAM Extensions initialized for sampler", this.id);
        } else {
            console.warn("WAMExtensions not available on window object");
        }
    }

    // Initialisation des définitions de notes pour l'extension Notes
    private _initNoteDefinitions(): void {
        if (this._noteExtension) {
            const notes: NoteDefinition[] = [];

            // Créer les définitions de notes basées sur notre grille emplacement identique au wamSampler 2D
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 4; col++) {
                    const midiNote = 60 + row * 4 + col; // C4 (60) à D#5 (75)

                    // Déterminer si c'est une touche noire (dièse/bémol)
                    const noteNumber = midiNote % 12;
                    const isBlackKey = [1, 3, 6, 8, 10].includes(noteNumber);

                    // Nom de la note
                    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                    const octave = Math.floor(midiNote / 12) - 1;
                    const noteName = `${noteNames[noteNumber]}${octave}`;

                    notes.push({
                        number: midiNote,
                        name: noteName,
                        blackKey: isBlackKey
                    });
                }
            }

            // Publier nos définitions de notes
            this._noteExtension.setNoteList(this.id, notes);
            console.log(`Published ${notes.length} note definitions for sampler ${this.id}`);
        }
    }

    // IMPLÉMENTATION DE L'INTERFACE PatternDelegate

    // Retourne la liste des patterns disponibles
    getPatternList(): PatternEntry[] {
        return Array.from(this._patterns.values()).map(pattern => ({
            id: pattern.id,
            name: pattern.name
        }));
    }

    // Crée un nouveau pattern
    createPattern(id: string): void {
        const newPattern: SamplerPattern = {
            id,
            name: `Pattern ${this._patterns.size + 1}`,
            sequence: []
        };

        this._patterns.set(id, newPattern);
        console.log(`Created new pattern: ${newPattern.name} (${id})`);
    }

    // Supprime un pattern
    deletePattern(id: string): void {
        // Si c'est le pattern courant, arrêter la lecture
        if (this._currentPattern === id) {
            this.playPattern(undefined);
        }

        const patternName = this._patterns.get(id)?.name;
        this._patterns.delete(id);
        console.log(`Deleted pattern: ${patternName} (${id})`);
    }

    // Joue un pattern, ou arrête la lecture si id est undefined
    playPattern(id: string | undefined): void {
        // Arrêter le pattern en cours s'il y en a un
        if (this._currentSequenceTimeout !== undefined) {
            window.clearTimeout(this._currentSequenceTimeout);
            this._currentSequenceTimeout = undefined;
        }

        // Arrêter l'enregistrement s'il est actif
        if (this._recordingEnabled) {
            this.toggleRecording();
        }

        if (!id) {
            // Arrêt de la lecture
            this._isPlaying = false;
            this._currentPattern = undefined;
            console.log("Pattern playback stopped");
            return;
        }

        const pattern = this._patterns.get(id);
        if (!pattern) {
            console.warn(`Pattern with id ${id} not found.`);
            return;
        }

        // Commencer la lecture
        this._isPlaying = true;
        this._currentPattern = id;
        console.log(`Playing pattern: ${pattern.name} (${id}) with ${pattern.sequence.length} notes`);

        // Trier la séquence par temps
        const sortedSequence = [...pattern.sequence].sort((a, b) => a.time - b.time);

        if (sortedSequence.length === 0) {
            console.log("Pattern is empty, nothing to play");
            this._isPlaying = false;
            return;
        }

        // Fonction récursive pour jouer les notes de la séquence
        const playSequence = (index: number) => {
            if (index >= sortedSequence.length || !this._isPlaying || this._currentPattern !== id) {
                this._isPlaying = false;
                return;
            }

            const note = sortedSequence[index];
            const nextNote = sortedSequence[index + 1];

            // Jouer la note actuelle
            this._playSample(note.midiNote, note.velocity / 127);

            // Mettre en évidence la presse de la touche
            const row = Math.floor((note.midiNote - 60) / 4);
            const col = (note.midiNote - 60) % 4;
            if (row >= 0 && row < 4 && col >= 0 && col < 4) {
                this._grid[row][col].isActivated = true;
                this._updateNoteColor(row, col);
            }

            // Programmer la note suivante
            if (nextNote) {
                const delay = (nextNote.time - note.time) * 1000; // Convertir en ms
                this._currentSequenceTimeout = window.setTimeout(() => {
                    playSequence(index + 1);
                }, delay);
            } else {
                // C'est la dernière note - boucler pour rejouer le pattern
                //const firstNote = sortedSequence[0];
                const loopDelay = 500; // Petit délai entre les boucles (500ms)

                // Si toujours en mode lecture, recommencer le pattern
                if (this._isPlaying && this._currentPattern === id) {
                    this._currentSequenceTimeout = window.setTimeout(() => {
                        // Recommencer depuis le début
                        playSequence(0);
                    }, loopDelay);
                }
            }
        };

        // Commencer la lecture
        playSequence(0);
    }

    // Récupère l'état d'un pattern
    getPatternState(id: string): any {
        return this._patterns.get(id);
    }

    // Définit l'état d'un pattern
    setPatternState(id: string, state: any): any {
        if (state && typeof state === "object") {
            const pattern = this._patterns.get(id);

            if (pattern) {
                // Mettre à jour le pattern existant
                if (state.name) pattern.name = state.name;
                if (Array.isArray(state.sequence)) pattern.sequence = state.sequence;
                console.log(`Updated pattern state: ${pattern.name} (${id})`);
            } else {
                // Créer un nouveau pattern avec l'état fourni
                this._patterns.set(id, {
                    id,
                    name: state.name || `Pattern ${this._patterns.size + 1}`,
                    sequence: Array.isArray(state.sequence) ? state.sequence : []
                });
                console.log(`Created pattern from state: ${state.name || `Pattern ${this._patterns.size}`} (${id})`);
            }

            return this._patterns.get(id);
        }

        return null;
    }

    // Active ou désactive l'enregistrement de pattern
    toggleRecording(patternId?: string): boolean {
        // Si déjà en mode enregistrement, désactiver
        if (this._recordingEnabled) {
            this._recordingEnabled = false;
            console.log("Pattern recording stopped");
            // Mettre à jour l'apparence du bouton d'enregistrement
            this._updateRecordingButtonAppearance(false);
            return false;
        }
        // Si on fournit un ID de pattern et qu'on n'est pas en mode lecture, activer l'enregistrement
        else if (patternId && !this._isPlaying) {
            // Vérifier si le pattern existe
            if (!this._patterns.has(patternId)) {
                this.createPattern(patternId);
            }

            this._currentPattern = patternId;
            this._recordingEnabled = true;
            this._recordingStartTime = this._audioCtx.currentTime;
            console.log(`Pattern recording started for ${patternId}`);

            // Mettre à jour l'apparence du bouton d'enregistrement
            this._updateRecordingButtonAppearance(true);
            return true;
        }

        return false;
    }

    // Ajoute une note à la séquence du pattern actuel
    addNoteToCurrentPattern(midiNote: number, velocity: number = 100): void {
        if (!this._currentPattern || !this._recordingEnabled) {
            return;
        }

        const pattern = this._patterns.get(this._currentPattern);
        if (!pattern) {
            console.warn(`Current pattern ${this._currentPattern} not found.`);
            return;
        }

        const currentTime = this._audioCtx.currentTime;
        const relativeTime = currentTime - this._recordingStartTime;

        pattern.sequence.push({
            midiNote,
            time: relativeTime,
            duration: 0.5, // Durée fixe pour l'instant
            velocity
        });

        console.log(`Added note ${midiNote} at time ${relativeTime} to pattern ${pattern.name}`);
    }

    // Création d'un bouton pour l'enregistrement rapide
    private _createRecordingButton(): void {
        const buttonMesh = B.MeshBuilder.CreateBox('recordButton', { width: 0.8, height: 0.2, depth: 0.8 }, this._scene);
        buttonMesh.position.set(0, 0.35, 2.3);
        buttonMesh.rotation.x = -Math.PI / 4;
        buttonMesh.parent = this.baseMesh;

        const buttonMaterial = new B.StandardMaterial("recordButtonMaterial", this._scene);
        buttonMaterial.diffuseColor = new B.Color3(0.6, 0.1, 0.1); // Rouge pour enregistrement
        buttonMaterial.emissiveColor = new B.Color3(0.2, 0.1, 0.1);
        buttonMesh.material = buttonMaterial;

        buttonMesh.actionManager = new B.ActionManager(this._scene);
        buttonMesh.actionManager.registerAction(
            new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
                // Si un pattern est déjà en cours d'enregistrement, arrêter l'enregistrement
                if (this._recordingEnabled) {
                    this.toggleRecording();
                }
                // Sinon, si un pattern est sélectionné, démarrer l'enregistrement
                else if (this._currentPattern) {
                    this.toggleRecording(this._currentPattern);
                }
                // Sinon, créer un nouveau pattern et démarrer l'enregistrement
                else {
                    const newPatternId = `pattern_${Date.now()}`;
                    this.toggleRecording(newPatternId);
                }
            })
        );

        const highlightLayer = new B.HighlightLayer(`hl-record-${this.id}`, this._scene);
        buttonMesh.actionManager.registerAction(
            new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, () => highlightLayer.addMesh(buttonMesh, B.Color3.Red()))
        );
        buttonMesh.actionManager.registerAction(
            new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, () => highlightLayer.removeMesh(buttonMesh))
        );

        this._recordButton = buttonMesh;
    }

    // Met à jour l'apparence du bouton d'enregistrement
    private _updateRecordingButtonAppearance(isRecording: boolean): void {
        if (!this._recordButton) return;

        const material = this._recordButton.material as B.StandardMaterial;
        if (isRecording) {
            // Rouge vif pour l'enregistrement actif
            material.diffuseColor = new B.Color3(1, 0, 0);
            material.emissiveColor = new B.Color3(0.5, 0, 0);
        } else {
            // Rouge plus foncé pour l'enregistrement inactif
            material.diffuseColor = new B.Color3(0.6, 0.1, 0.1);
            material.emissiveColor = new B.Color3(0.2, 0.1, 0.1);
        }
    }

    protected _createBaseMesh(): void {
        this.baseMesh = B.MeshBuilder.CreateBox('samplerBase', { width: 4.5, height: 0.2, depth: 4 }, this._scene);
        const material = new B.StandardMaterial('baseMaterial', this._scene);
        material.diffuseColor = new B.Color3(0, 0, 0);
        this.baseMesh.material = material;
    }

    private _createGrid(): void {
        for (let row = 0; row < 4; row++) {
            this._grid.push([]);
            for (let col = 0; col < 4; col++) {
                this._createNoteButton(row, col);
            }
        }
    }

    // Modification de la méthode _createNoteButton pour intégrer la gestion des patterns
    private _createNoteButton(row: number, column: number): void {
        const buttonMesh = B.MeshBuilder.CreateBox(`button${row}${column}`, { width: 0.8, height: 0.2, depth: 0.8 }, this._scene);
        buttonMesh.position.set(column - 1.5, 0.1, row - 1.5);
        buttonMesh.parent = this.baseMesh;

        const buttonMaterial = new B.StandardMaterial(`buttonMaterial${row}${column}`, this._scene);
        buttonMaterial.diffuseColor = new B.Color3(0, 0, 1);
        buttonMesh.material = buttonMaterial;

        const textPlane = this._createNoteLabel(row, column);
        textPlane.parent = buttonMesh;

        const midiNote = 60 + row * 4 + column; // C4 (60) à D#5 (75)
        this._grid[row].push({ mesh: buttonMesh, isActivated: false, midiNote });

        buttonMesh.actionManager = new B.ActionManager(this._scene);
        buttonMesh.actionManager.registerAction(
            new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, async () => {
                const gridItem = this._grid[row][column];
                gridItem.isActivated = !gridItem.isActivated;
                this._updateNoteColor(row, column);

                if (gridItem.isActivated) {
                    await this._playSample(gridItem.midiNote);

                    // Si l'enregistrement est activé, ajouter la note au pattern courant
                    if (this._recordingEnabled && this._currentPattern) {
                        this.addNoteToCurrentPattern(gridItem.midiNote);
                    }
                } else {
                    this._stopSample(gridItem);
                }
            })
        );
    }

    private _createNoteLabel(row: number, column: number): B.Mesh {
        const notes = [
            ['C4', 'C#4', 'D4', 'D#4'],
            ['E4', 'F4', 'F#4', 'G4'],
            ['G#4', 'A4', 'A#4', 'B4'],
            ['C5', 'C#5', 'D5', 'D#5'],
        ];
        const note = notes[row][column];

        const textPlane = B.MeshBuilder.CreatePlane(`text${row}${column}`, { width: 0.6, height: 0.6 }, this._scene);
        textPlane.position.y = 0.101;
        textPlane.rotation.x = Math.PI / 2;
        textPlane.isPickable = false;

        const textTexture = new B.DynamicTexture("textTexture", { width: 256, height: 256 }, this._scene, true);
        const textMaterial = new B.StandardMaterial(`textMaterial${row}${column}`, this._scene);
        textMaterial.diffuseTexture = textTexture;
        textMaterial.opacityTexture = textTexture;
        textMaterial.useAlphaFromDiffuseTexture = true;
        textPlane.material = textMaterial;

        const ctx = textTexture.getContext();
        ctx.clearRect(0, 0, 256, 256);
        ctx.font = "bold 72px Arial";
        ctx.fillStyle = "black";
        ctx.fillText(note, 128, 128);
        textTexture.update();

        return textPlane;
    }

    private _updateNoteColor(row: number, column: number): void {
        const material = this._grid[row][column].mesh.material as B.StandardMaterial;
        material.diffuseColor = this._grid[row][column].isActivated ? new B.Color3(1, 0, 0) : new B.Color3(0, 0, 1);
        if (this._grid[row][column].isActivated) {
            setTimeout(() => {
                material.diffuseColor = new B.Color3(0, 0, 1);
                this._grid[row][column].isActivated = false;
            }, 1000);
        }
    }

    private _stopSample(gridItem: { samplePlayer?: AudioBufferSourceNode }): void {
        if (gridItem.samplePlayer) {
            gridItem.samplePlayer.stop();
            gridItem.samplePlayer.disconnect();
            gridItem.samplePlayer = undefined;
        }
    }

    private async _playSample(midiNote: number, gain: number = 1.0,propagate: boolean = true): Promise<void> {
        if (!this._sampleBuffers.has(midiNote)) {
            console.warn(`Aucun échantillon pour la note MIDI ${midiNote}`);
            return;
        }

        const source = this._audioCtx.createBufferSource();
        source.buffer = this._sampleBuffers.get(midiNote)!;

        // Ajouter un gain node pour contrôler le volume par note
        const gainNode = this._audioCtx.createGain();
        gainNode.gain.value = gain;

        source.connect(gainNode);
        gainNode.connect(this._outputNode);

        source.start();
        this._grid[Math.floor((midiNote - 60) / 4)][(midiNote - 60) % 4].samplePlayer = source;

        if (propagate){
            this.eventBus.emit("WAM_SAMPLER_NOTE_PLAY", {
                nodeId: this.id,
                midiNote: midiNote,
                velocity: Math.round(gain * 127),
                timestamp: Date.now()
            });
        }
    }

    private _createSettingsButton(): void {
        const buttonMesh = B.MeshBuilder.CreateBox('settingsButton', { width: 0.8, height: 0.2, depth: 0.8 }, this._scene);
        buttonMesh.position.set(1.5, 0.35, 2.3);
        buttonMesh.rotation.x = -Math.PI / 4;
        buttonMesh.parent = this.baseMesh;

        const buttonMaterial = new B.StandardMaterial("buttonMaterial", this._scene);
        buttonMaterial.diffuseColor = new B.Color3(0.3, 0.3, 0.3);
        buttonMaterial.emissiveColor = new B.Color3(0.2, 0.2, 0.2);
        buttonMesh.material = buttonMaterial;

        buttonMesh.actionManager = new B.ActionManager(this._scene);
        buttonMesh.actionManager.registerAction(
            new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => this._showSettingsMenu())
        );

        const highlightLayer = new B.HighlightLayer(`hl-settings-${this.id}`, this._scene);
        buttonMesh.actionManager.registerAction(
            new B.ExecuteCodeAction(B.ActionManager.OnPointerOverTrigger, () => highlightLayer.addMesh(buttonMesh, B.Color3.Blue()))
        );
        buttonMesh.actionManager.registerAction(
            new B.ExecuteCodeAction(B.ActionManager.OnPointerOutTrigger, () => highlightLayer.removeMesh(buttonMesh))
        );
    }

    private _showSettingsMenu(): void {
        this._settingsMenu.show();
    }

    public async loadPreset(presetName: string,propagate:boolean): Promise<void> {
        this._sampleBuffers.clear();
        const preset = PresetManager.presets.find((p) => p.name === presetName);
        if (!preset) {
            console.warn(`Preset "${presetName}" non trouvé dans PresetManager.presets`);
            return;
        }

        const baseNotes = Array.from({ length: 16 }, (_, i) => 60 + i); // 60 à 75
        for (let i = 0; i < Math.min(baseNotes.length, preset.samples.length); i++) {
            const sample = preset.samples[i];
            const buffer = await this._loadSample(sample.url);
            if (buffer) {
                this._sampleBuffers.set(baseNotes[i], buffer);
            } else {
                console.warn(`Échantillon ${sample.url} non chargé pour la note ${baseNotes[i]}`);
            }
        }
        console.log(`Preset "${presetName}" chargé avec ${this._sampleBuffers.size} échantillons.`);
        if(propagate) {
            if(this._currentPreset !== presetName) this.eventBus.emit("WAM_SAMPLER_PRESET_CHANGE", {nodeId: this.id, preset: presetName, source: 'user'});
        }
        this._currentPreset = presetName;
    }
    public getCurrentPreset(): string {
        return this._currentPreset;
    }
    private async _loadSample(url: string): Promise<AudioBuffer | null> {
        try {
            const resolvedUrl = new URL(url, import.meta.url).href;
            console.log(`Tentative de chargement de : ${resolvedUrl}`);
            const response = await fetch(resolvedUrl);
            if (!response.ok) {
                console.error(`Erreur HTTP pour ${resolvedUrl}: ${response.status} - ${response.statusText}`);
                return null;
            }
            const arrayBuffer = await response.arrayBuffer();
            if (arrayBuffer.byteLength === 0) {
                console.error(`Fichier vide pour ${resolvedUrl}`);
                return null;
            }
            const audioBuffer = await this._audioCtx.decodeAudioData(arrayBuffer);
            console.log(`Échantillon chargé avec succès : ${resolvedUrl}`);
            return audioBuffer;
        } catch (error) {
            console.error(`Erreur lors du chargement ou décodage de ${url} :`, error);
            return null;
        }
    }

    private _positionIOConnectors(): void {
        if (this.inputMeshMidi) {
            this.inputMeshMidi.position.set(-2.5, this.baseMesh.position.y, this.baseMesh.position.z);
        }
        if (this.outputMesh) {
            this.outputMesh.position.set(2.5, this.baseMesh.position.y, this.baseMesh.position.z);
        }
    }

    // Surcharge des méthodes de connexion audio
    public connect(destination: AudioNode): void {
        this._outputNode.connect(destination);
    }

    public disconnect(destination: AudioNode): void {
        this._outputNode.disconnect(destination);
    }

    // Getter pour le nœud audio
    public getAudioNode(): AudioNode {
        return this._outputNode;
    }
}