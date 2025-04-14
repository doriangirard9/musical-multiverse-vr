import * as B from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import { WamSampler3D } from "./WamSampler3D.ts";

export class SamplerSettingsMenu {
    /** Gestionnaire GUI 3D */
    private readonly _manager: GUI.GUI3DManager;
    /** Menu actif */
    private _menu: GUI.NearMenu | null = null;
    /** Référence au parent WamSampler3D */
    private readonly _parent: WamSampler3D;
    /** ID du pattern sélectionné */
    private _selectedPatternId: string | undefined;
    /** État d'enregistrement */
    private _isRecording: boolean = false;

    constructor(scene: B.Scene, parent: WamSampler3D) {
        this._manager = new GUI.GUI3DManager(scene);
        this._parent = parent;
        if (this._manager.utilityLayer) {
            this._manager.utilityLayer.pickingEnabled = true;
            this._manager.utilityLayer.processAllEvents = false;
            this._manager.utilityLayer.onlyCheckPointerDownEvents = true;
            this._manager.utilityLayer.pickUtilitySceneFirst = true;
        }
    }

    /** Affichage du menu */
    public show(): void {
        this.hide();
        this._menu = new GUI.NearMenu("samplerSettings");
        this._manager.addControl(this._menu);
        this._menu.margin = 0.1;

        const follower = this._menu.defaultBehavior.followBehavior;
        follower.defaultDistance = 4.5;
        follower.minimumDistance = 4.5;
        follower.maximumDistance = 4.5;

        this._showMainView();
    }

    /** Vidage du menu */
    private _clearMenu(): void {
        if (!this._menu) return;
        const children = this._menu.children.slice();
        children.forEach((child: GUI.Control3D) => this._menu!.removeControl(child));
    }

    /** Affichage de la vue principale */
    private _showMainView(): void {
        this._clearMenu();
        if (!this._menu) return;
        this._menu.rows = 1;
        this._menu.columns = 4;
        this._menu.scaling = new B.Vector3(0.7, 0.7, 0.7);
        const drumsButton = new GUI.TouchHolographicButton("drums");
        drumsButton.text = "DRUMS";
        drumsButton.onPointerUpObservable.add(() => this._showDrumsView());
        this._menu.addButton(drumsButton);

        const instrumentsButton = new GUI.TouchHolographicButton("instruments");
        instrumentsButton.text = "INSTRUMENTS";
        instrumentsButton.onPointerUpObservable.add(() => this._showInstrumentsView());
        this._menu.addButton(instrumentsButton);

        // Nouveau bouton pour accéder aux patterns
        const patternsButton = new GUI.TouchHolographicButton("patterns");
        patternsButton.text = "PATTERNS";
        patternsButton.onPointerUpObservable.add(() => this._showPatternsView());
        this._menu.addButton(patternsButton);

        const closeButton = new GUI.TouchHolographicButton("close");
        closeButton.text = "Close";
        closeButton.onPointerUpObservable.add(() => this.hide());
        this._menu.addButton(closeButton);
    }

    /** Affichage des presets de batterie */
    private _showDrumsView(): void {
        this._clearMenu();
        if (!this._menu) return;

        this._menu.rows = 3;
        this._menu.columns = 4;
        this._menu.margin = 0.1;

        const drumPresets = [
            "Basic Kit",
            "Electronic",
            "808",
            "Hip-Hop",
            "Garage",
            "Funky",
            "House",
            "Pop",
        ];

        drumPresets.forEach((preset) => {
            const presetButton = new GUI.TouchHolographicButton(preset);
            presetButton.text = preset;
            presetButton.onPointerUpObservable.add(() => {
                    this._parent.loadPreset(preset, true);
                    this.hide();
                }
            );
            this._menu!.addButton(presetButton);
        });

        const backButton = new GUI.TouchHolographicButton("back");
        backButton.text = "Back";
        backButton.onPointerUpObservable.add(() => this._showMainView());
        this._menu.addButton(backButton);
    }

    /** Affichage des presets d'instruments */
    private _showInstrumentsView(): void {
        this._clearMenu();
        if (!this._menu) return;

        this._menu.rows = 2;
        this._menu.columns = 3;

        const instrumentPresets = ["Orchestra", "Grand Piano", "Steveland Vinyl"];

        instrumentPresets.forEach((preset) => {
            const presetButton = new GUI.TouchHolographicButton(preset);
            presetButton.text = preset;
            presetButton.onPointerUpObservable.add(() => {
                this._parent.loadPreset(preset, true);
                this.hide();
            });
            this._menu!.addButton(presetButton);
        });

        const backButton = new GUI.TouchHolographicButton("back");
        backButton.text = "Back";
        backButton.onPointerUpObservable.add(() => this._showMainView());
        this._menu.addButton(backButton);
    }

    /** Affichage de la gestion des patterns */
    private _showPatternsView(): void {
        this._clearMenu();
        if (!this._menu) return;

        // Récupérer la liste des patterns
        const patterns = this._parent.getPatternList();

        // Définir la disposition en fonction du nombre de patterns

        this._menu.rows = 3;
        this._menu.columns = 5;

        // Ajouter les boutons pour chaque pattern
        patterns.forEach(pattern => {
            const patternButton = new GUI.TouchHolographicButton(pattern.id);

            // Utiliser un préfixe pour indiquer la sélection
            if (pattern.id === this._selectedPatternId) {
                patternButton.text = `▶ ${pattern.name}`;
                // Optionnellement modifier l'apparence du texte si possible
                try {
                    const frontMaterial = patternButton.frontMaterial;
                    if (frontMaterial) {
                        // Au lieu d'utiliser emissiveColor qui n'existe pas, utiliser edgeColor disponible
                        frontMaterial.edgeColor = new B.Color4(0.2, 0.6, 1, 1);
                        // Vous pouvez aussi rendre le bord plus visible
                        frontMaterial.edgeWidth = 0.15;
                        // Activer la bordure si nécessaire
                        frontMaterial.showFrame = true;
                    }
                } catch (e) {
                    // Ignorer les erreurs si frontMaterial n'est pas accessible
                }
            } else {
                patternButton.text = pattern.name;
            }

            patternButton.onPointerUpObservable.add(() => this._selectPattern(pattern.id));
            this._menu!.addButton(patternButton);
        });

        // Si aucun pattern n'existe, afficher un message
        if (patterns.length === 0) {
            const noPatternButton = new GUI.TouchHolographicButton("noPattern");
            noPatternButton.text = "No patterns yet.";
            this._menu.addButton(noPatternButton);
        }

        // Ajouter les boutons d'action
        // Ajout du bouton "New"
        const newButton = new GUI.TouchHolographicButton("newPattern");
        newButton.text = "New Pattern";
        newButton.onPointerUpObservable.add(() => this._createNewPattern());
        this._menu.addButton(newButton);

        // Ajout du bouton "Play" (avec indication si désactivé)
        const playButton = new GUI.TouchHolographicButton("playPattern");

        if (this._selectedPatternId) {
            playButton.text = "Play";
            playButton.onPointerUpObservable.add(() => this._playSelectedPattern());
        } else {
            playButton.text = "Play (Select a pattern)";
            // On ajoute toujours l'événement mais on vérifie à l'intérieur
            playButton.onPointerUpObservable.add(() => {
                if (this._selectedPatternId) {
                    this._playSelectedPattern();
                }
            });
        }
        this._menu.addButton(playButton);

        // Ajout du bouton "Stop"
        const stopButton = new GUI.TouchHolographicButton("stopPattern");
        stopButton.text = "Stop";
        stopButton.onPointerUpObservable.add(() => this._stopPlayback());
        this._menu.addButton(stopButton);

        // Ajout du bouton "Record" (avec indication d'état)
        const recordButton = new GUI.TouchHolographicButton("recordPattern");

        if (this._isRecording) {
            recordButton.text = "■ Stop Recording";
            // Optionnellement, on peut essayer de changer la couleur
            try {
                const frontMaterial = recordButton.frontMaterial;
                if (frontMaterial) {
                    // Au lieu d'utiliser emissiveColor qui n'existe pas, utiliser edgeColor disponible
                    frontMaterial.edgeColor = new B.Color4(0.2, 0.6, 1, 1);
                    // Vous pouvez aussi rendre le bord plus visible
                    frontMaterial.edgeWidth = 0.15;
                    // Activer la bordure si nécessaire
                    frontMaterial.showFrame = true;
                }
            } catch (e) {
                // Ignorer les erreurs
            }
        } else {
            if (this._selectedPatternId) {
                recordButton.text = "Record";
            } else {
                recordButton.text = "Record (Select a pattern)";
            }
        }

        recordButton.onPointerUpObservable.add(() => {
            if (this._isRecording || this._selectedPatternId) {
                this._toggleRecording();
            }
        });
        this._menu.addButton(recordButton);

        // Ajout du bouton "Delete" (avec indication si désactivé)
        const deleteButton = new GUI.TouchHolographicButton("deletePattern");

        if (this._selectedPatternId) {
            deleteButton.text = "Delete";
            deleteButton.onPointerUpObservable.add(() => this._deleteSelectedPattern());
        } else {
            deleteButton.text = "Delete (Select a pattern)";
            // On ajoute toujours l'événement mais on vérifie à l'intérieur
            deleteButton.onPointerUpObservable.add(() => {
                if (this._selectedPatternId) {
                    this._deleteSelectedPattern();
                }
            });
        }
        this._menu.addButton(deleteButton);

        // Ajout du bouton "Back"
        const backButton = new GUI.TouchHolographicButton("back");
        backButton.text = "Back";
        backButton.onPointerUpObservable.add(() => this._showMainView());
        this._menu.addButton(backButton);
    }

    /** Sélection d'un pattern */
    private _selectPattern(id: string): void {
        // Si le pattern est déjà sélectionné, le désélectionner
        if (this._selectedPatternId === id) {
            this._selectedPatternId = undefined;
        } else {
            this._selectedPatternId = id;
        }

        // Mettre à jour l'affichage
        this._showPatternsView();
    }

    /** Création d'un nouveau pattern */
    private _createNewPattern(): void {
        // Générer un ID unique
        const id = `pattern_${Date.now()}`;

        // Créer le pattern dans le sampler
        this._parent.createPattern(id);

        // Définir un nom par défaut
        const patternState = this._parent.getPatternState(id);
        if (patternState) {
            const patternCount = this._parent.getPatternList().length;
            patternState.name = `Pattern ${patternCount}`;
            this._parent.setPatternState(id, patternState);
        }

        // Sélectionner le nouveau pattern
        this._selectedPatternId = id;

        // Rafraîchir l'affichage
        this._showPatternsView();
    }

    /** Lecture du pattern sélectionné */
    private _playSelectedPattern(): void {
        if (this._selectedPatternId) {
            this._parent.playPattern(this._selectedPatternId);
        }
    }

    /** Arrêt de la lecture */
    private _stopPlayback(): void {
        this._parent.playPattern(undefined);
    }

    /** Activation/désactivation de l'enregistrement */
    private _toggleRecording(): void {
        if (this._selectedPatternId) {
            this._isRecording = this._parent.toggleRecording(this._selectedPatternId);
            // Rafraîchir l'affichage
            this._showPatternsView();
        }
    }

    /** Suppression du pattern sélectionné */
    private _deleteSelectedPattern(): void {
        if (this._selectedPatternId) {
            this._showDeleteConfirmation(this._selectedPatternId);
        }
    }

    /** Affichage de la confirmation de suppression */
    private _showDeleteConfirmation(patternId: string): void {
        this._clearMenu();
        if (!this._menu) return;

        this._menu.rows = 2;
        this._menu.columns = 2;

        // Trouver le nom du pattern
        const pattern = this._parent.getPatternList().find(p => p.id === patternId);
        const patternName = pattern ? pattern.name : "this pattern";

        // Ajouter un texte d'avertissement (en utilisant un bouton non cliquable)
        const warningText = new GUI.TouchHolographicButton("warningText");
        warningText.text = `Delete ${patternName}?`;
        this._menu.addButton(warningText);

        // Bouton Confirmer
        const confirmButton = new GUI.TouchHolographicButton("confirm");
        confirmButton.text = "Yes, Delete";
        confirmButton.onPointerUpObservable.add(() => {
            // Supprimer le pattern
            this._parent.deletePattern(patternId);

            // Réinitialiser la sélection si nécessaire
            if (this._selectedPatternId === patternId) {
                this._selectedPatternId = undefined;
            }

            // Revenir à la vue des patterns
            this._showPatternsView();
        });
        this._menu.addButton(confirmButton);

        // Bouton Annuler
        const cancelButton = new GUI.TouchHolographicButton("cancel");
        cancelButton.text = "Cancel";
        cancelButton.onPointerUpObservable.add(() => this._showPatternsView());
        this._menu.addButton(cancelButton);
    }

    /** Masquage du menu */
    public hide(): void {
        if (this._menu) {
            this._menu.dispose();
            this._menu = null;
        }
    }
}