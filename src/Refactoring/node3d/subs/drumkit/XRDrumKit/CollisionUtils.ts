import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource";
import { DRUMKIT_CONFIG } from "./XRDrumKitConfig";
import XRDrumstick from "./XRDrumstick";

/**
 * Shared collision handling logic for all drum components
 * Eliminates code duplication across XRDrum, XRCymbal, XRHiHat
 */
export class CollisionUtils {
    
    /**
     * Calculate MIDI velocity from drumstick hit
     * Uses both linear and angular velocity with proper scaling
     * 
     * @param drumstick - The drumstick that hit the component
     * @returns MIDI velocity value (1-127)
     */
    static calculateHitVelocity(drumstick: XRDrumstick): number {
        const { linear, angular } = drumstick.getVelocity();
        
        const linearSpeed = linear.length();
        const angularSpeed = angular.length();
        
        // Weighted combination: linear is primary, angular is secondary
        const combinedSpeed = linearSpeed + (angularSpeed * DRUMKIT_CONFIG.velocity.angularWeight);
        
        // Normalize to 0-1 range
        const normalizedSpeed = Math.max(0, Math.min(1, 
            (combinedSpeed - DRUMKIT_CONFIG.physics.minVelocity) / 
            (DRUMKIT_CONFIG.physics.maxVelocity - DRUMKIT_CONFIG.physics.minVelocity)
        ));
        
        // Apply power curve for better feel
        const curvedSpeed = Math.pow(normalizedSpeed, DRUMKIT_CONFIG.physics.velocityCurve);
        
        // Scale to MIDI velocity range (1-127, never 0 for a detected hit)
        return Math.max(1, Math.min(127, Math.round(curvedSpeed * 127)));
    }

    /**
     * Check if enough time has passed since last hit (debouncing)
     * Prevents multiple sound triggers from a single physical hit
     * 
     * @param drumstickId - Unique ID of the drumstick
     * @param lastHitTime - Map storing last hit times per drumstick
     * @returns true if hit should be processed, false if debounced
     */
    static checkDebounce(
        drumstickId: string, 
        lastHitTime: Map<string, number>
    ): boolean {
        const now = performance.now();
        const lastHit = lastHitTime.get(drumstickId) || 0;
        
        if (now - lastHit < DRUMKIT_CONFIG.physics.debounceMs) {
            return false; // Too soon, ignore this hit
        }
        
        lastHitTime.set(drumstickId, now);
        return true; // Process this hit
    }

    /**
     * Trigger haptic feedback on the controller
     * Intensity scales with hit velocity
     * 
     * @param controller - XR controller to vibrate
     * @param velocity - MIDI velocity (1-127) determining vibration intensity
     */
    static triggerHapticFeedback(
        controller: WebXRInputSource | null | undefined,
        velocity: number
    ): void {
        if (!controller?.motionController?.gamepadObject?.hapticActuators?.[0]) {
            return;
        }

        // Scale haptic intensity with velocity
        const intensityRange = DRUMKIT_CONFIG.haptics.maxIntensity - DRUMKIT_CONFIG.haptics.minIntensity;
        const hapticIntensity = DRUMKIT_CONFIG.haptics.minIntensity + (velocity / 127) * intensityRange;
        
        controller.motionController.gamepadObject.hapticActuators[0].pulse(
            hapticIntensity, 
            DRUMKIT_CONFIG.haptics.duration
        );
    }

    /**
     * Schedule MIDI note on/off events
     * 
     * @param wamInstance - WAM audio plugin instance
     * @param audioContext - Web Audio API context
     * @param midiKey - MIDI note number
     * @param velocity - MIDI velocity (1-127)
     * @param duration - Note duration in seconds
     */
    static scheduleSound(
        wamInstance: any,
        audioContext: AudioContext,
        midiKey: number,
        velocity: number,
        duration: number
    ): void {
        if (!wamInstance) {
            return;
        }

        // Note ON
        wamInstance.audioNode.scheduleEvents({
            type: 'wam-midi',
            time: audioContext.currentTime,
            data: { bytes: new Uint8Array([0x90, midiKey, velocity]) }
        });

        // Note OFF
        wamInstance.audioNode.scheduleEvents({
            type: 'wam-midi',
            time: audioContext.currentTime + duration,
            data: { bytes: new Uint8Array([0x80, midiKey, velocity]) }
        });
    }

    /**
     * Check if drumstick movement is downward (for drums that should only respond to top hits)
     * 
     * @param linearVelocity - Linear velocity vector of the drumstick
     * @returns true if moving downward (negative Y), false otherwise
     */
    static isDownwardHit(linearVelocity: Vector3): boolean {
        return linearVelocity.y < 0;
    }

    /**
     * Find which drumstick caused the collision
     * 
     * @param collision - Collision event data
     * @param drumsticks - Array of all drumsticks
     * @returns Index of the drumstick, or -1 if not found
     */
    static findDrumstickIndex(
        collision: any,
        drumsticks: XRDrumstick[]
    ): number {
        for (let i = 0; i < drumsticks.length; i++) {
            const drumstickId = drumsticks[i].drumstickAggregate.transformNode.id;
            const isThisDrumstick = 
                collision.collider.transformNode.id === drumstickId ||
                collision.collidedAgainst.transformNode.id === drumstickId;
            
            if (isThisDrumstick) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Check if collision involves a specific trigger
     * 
     * @param collision - Collision event data
     * @param triggerName - Name of the trigger to check
     * @returns true if this collision involves the specified trigger
     */
    static isCollisionWithTrigger(collision: any, triggerName: string): boolean {
        return collision.collidedAgainst.transformNode.id === triggerName ||
               collision.collider.transformNode.id === triggerName;
    }
}
