import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DRUMKIT_CONFIG } from "../XRDrumKitConfig";

/**
 * Centralized logging utility for drum components
 * Provides consistent logging with component names and conditional output
 */
export class DrumComponentLogger {
    private componentName: string;
    private enabled: boolean;

    constructor(componentName: string, enabled: boolean = DRUMKIT_CONFIG.debug.logCollisions) {
        this.componentName = componentName;
        this.enabled = enabled;
    }

    /**
     * Enable or disable logging for this component
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Log collision detection
     */
    logCollision(collision: any): void {
        if (!this.enabled) return;
        
        console.log(`[${this.componentName}] Trigger collision detected:`, collision);
        console.log(`  Collider: ${collision.collider.transformNode.id}`);
        console.log(`  Collided against: ${collision.collidedAgainst.transformNode.id}`);
    }

    /**
     * Log velocity calculations
     */
    logVelocity(linear: Vector3, angular: Vector3, velocity: number, combinedSpeed: number): void {
        if (!this.enabled || !DRUMKIT_CONFIG.debug.logVelocity) return;
        
        console.log(`[${this.componentName}] Velocity calculation:`);
        console.log(`  Linear speed: ${linear.length().toFixed(3)} m/s`);
        console.log(`  Angular speed: ${angular.length().toFixed(3)} rad/s`);
        console.log(`  Combined speed: ${combinedSpeed.toFixed(3)} m/s`);
        console.log(`  MIDI velocity: ${velocity} (1-127)`);
        console.log(`  Movement direction: ${linear.y < 0 ? 'DOWNWARD' : 'UPWARD'}`);
    }

    /**
     * Log debouncing
     */
    logDebounce(): void {
        if (!this.enabled) return;
        console.log(`[${this.componentName}] Hit debounced - too soon after last hit`);
    }

    /**
     * Log sound playback
     */
    logSound(midiKey: number, velocity: number): void {
        if (!this.enabled) return;
        console.log(`[${this.componentName}] Playing MIDI note ${midiKey} at velocity ${velocity}`);
    }

    /**
     * Log physics setup
     */
    logPhysicsSetup(meshName: string, vertices?: number): void {
        if (!this.enabled) return;
        
        if (vertices !== undefined) {
            console.log(`[${this.componentName}] Physics trigger created for ${meshName} (${vertices} vertices)`);
        } else {
            console.log(`[${this.componentName}] Physics body created for ${meshName}`);
        }
    }

    /**
     * Log bounding box visualization
     */
    logBoundingBox(meshName: string): void {
        if (!this.enabled || !DRUMKIT_CONFIG.debug.showBoundingBoxes) return;
        console.log(`[${this.componentName}] Bounding box enabled for ${meshName}`);
    }

    /**
     * Log generic debug message
     */
    logDebug(message: string, ...args: any[]): void {
        if (!this.enabled) return;
        console.log(`[${this.componentName}] ${message}`, ...args);
    }

    /**
     * Log error message (always shown regardless of debug settings)
     */
    logError(message: string, ...args: any[]): void {
        console.error(`[${this.componentName}] ERROR: ${message}`, ...args);
    }

    /**
     * Log warning message (always shown regardless of debug settings)
     */
    logWarning(message: string, ...args: any[]): void {
        console.warn(`[${this.componentName}] WARNING: ${message}`, ...args);
    }

    /**
     * Log available meshes (for debugging mesh loading)
     */
    logAvailableMeshes(meshes: any[]): void {
        if (!this.enabled) return;
        console.log(`[${this.componentName}] Available meshes:`, meshes.map(m => m.name));
    }

    /**
     * Log animation trigger
     */
    logAnimation(velocity: number): void {
        if (!this.enabled) return;
        console.log(`[${this.componentName}] Animating with velocity ${velocity}`);
    }

    /**
     * Log cymbal-specific physics (impulse application, rotation limits, etc.)
     */
    logCymbalPhysics(message: string, data?: any): void {
        if (!this.enabled) return;
        if (data) {
            console.log(`[${this.componentName}] Cymbal physics: ${message}`, data);
        } else {
            console.log(`[${this.componentName}] Cymbal physics: ${message}`);
        }
    }
}
