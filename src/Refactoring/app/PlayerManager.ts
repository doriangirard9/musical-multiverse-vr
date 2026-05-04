import * as B from "@babylonjs/core";
import {v4} from "uuid";
import {PlayerState} from "../network/types.ts";
import {NetworkEventBus} from "../eventBus/NetworkEventBus.ts";
import {SceneManager} from "./SceneManager.ts";
import { InputManager } from "../xr/inputs/InputManager.ts";

export class PlayerManager {
    private static readonly DEBUG_LOG = false;
    private static _instance: PlayerManager;
    private readonly _id: string;
    private inputs = InputManager.getInstance();
    private networkEventBus = NetworkEventBus.getInstance();

    // Paramètres de throttling et delta compression
    private readonly UPDATE_INTERVAL = 50; // 20 fois par seconde (en ms)
    private lastUpdateTime = 0;
    private lastSentState: PlayerState | null = null;
    private readonly POSITION_THRESHOLD = 0.01; // 1cm de mouvement minimum
    private readonly ROTATION_THRESHOLD = 0.02; // ~1 degré de rotation minimum

    private constructor(playerId: string) {
        this._id = playerId;
        if (PlayerManager.DEBUG_LOG) console.log(`[PlayerManager] Initialized with player ID: ${this._id}`);

        // Démarrer la boucle de mise à jour throttled
        this.startUpdateLoop();
    }

    public static initialize(playerId: string): void {
        this._instance = new PlayerManager(playerId)
    }

    public static getInstance(): PlayerManager {
        if (!PlayerManager._instance) throw new Error("PlayerManager not initialized. Call initialize() first.")
        return PlayerManager._instance;
    }

    /**
     * Démarre une boucle de mise à jour throttled
     */
    private startUpdateLoop(): void {
        const scene = SceneManager.getInstance().getScene();

        // S'abonner à l'événement avant rendu
        scene.onBeforeRenderObservable.add(() => {
            const currentTime = performance.now();

            // Appliquer le throttling
            if (currentTime - this.lastUpdateTime > this.UPDATE_INTERVAL) {
                this._checkAndSendPlayerState();
                this.lastUpdateTime = currentTime;
            }
        });
    }

    /**
     * Vérifie si l'état a suffisamment changé et l'envoie si nécessaire
     */
    private _checkAndSendPlayerState(): void {
        const currentState = this.getPlayerState();
        if (!currentState) return;

        // Premier envoi ou a significativement changé
        if (!this.lastSentState || this.hasSignificantChange(currentState, this.lastSentState)) {
            this.networkEventBus.emit('PLAYER_STATE_UPDATED', {
                playerState: currentState
            });

            // Stocker l'état envoyé
            this.lastSentState = {...currentState};
        }
    }

    /**
     * Détermine si le changement d'état est suffisamment significatif pour être envoyé
     */
    private hasSignificantChange(current: PlayerState, previous: PlayerState): boolean {
        // Vérifier changement de position
        if (this.getDistance(current.position, previous.position) > this.POSITION_THRESHOLD) {
            return true;
        }

        // Vérifier changement de direction
        if (this.getDistance(current.direction, previous.direction) > this.ROTATION_THRESHOLD) {
            return true;
        }

        // Vérifier changement de position des mains
        return this.getDistance(current.leftHandPosition, previous.leftHandPosition) > this.POSITION_THRESHOLD ||
            this.getDistance(current.rightHandPosition, previous.rightHandPosition) > this.POSITION_THRESHOLD;


    }

    /**
     * Calcule la distance entre deux positions 3D
     */
    private getDistance(pos1: {x: number, y: number, z: number}, pos2: {x: number, y: number, z: number}): number {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        const dz = pos1.z - pos2.z;
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
    }


    public getPlayerState(): PlayerState | undefined {

        if (!this.inputs.left || !this.inputs.right) {
            return undefined;
        }

        // Reste du code inchangé...
        const headPosition: B.Vector3 = this.inputs.head.origin
        const headDirection: B.Vector3 = this.inputs.head.forward
        const leftPosition: B.Vector3 = this.inputs.left.pointer.origin
        const rightPosition: B.Vector3 = this.inputs.right.pointer.origin

        return {
            id: this._id,
            position: {x: headPosition.x, y: headPosition.y, z: headPosition.z},
            direction: {x: headDirection.x, y: headDirection.y, z: headDirection.z},
            leftHandPosition: {
                x: leftPosition.x + 0.05,
                y: leftPosition.y,
                z: leftPosition.z - 0.2
            },
            rightHandPosition: {
                x: rightPosition.x - 0.05,
                y: rightPosition.y,
                z: rightPosition.z - 0.2
            },
        };
    }

    public getId(): string {
        return this._id;
    }
}