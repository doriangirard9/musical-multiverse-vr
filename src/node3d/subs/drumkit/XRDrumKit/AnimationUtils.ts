import { AbstractMesh } from "@babylonjs/core";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Animation } from "@babylonjs/core/Animations/animation";
import { CubicEase, EasingFunction } from "@babylonjs/core/Animations/easing";
import { Scene } from "@babylonjs/core/scene";
import { DRUMKIT_CONFIG } from "./XRDrumKitConfig";

/**
 * Utility class for creating animations on drum components
 * Centralizes animation logic to avoid duplication across XRDrum, XRCymbal, XRHiHat
 */
export class AnimationUtils {
    
    /**
     * Create a tremble animation for a drum or hi-hat when hit
     * The mesh will oscillate vertically based on hit velocity
     * 
     * @param mesh - The mesh to animate
     * @param velocity - MIDI velocity (1-127) determining animation intensity
     * @param basePosition - Original position to return to
     * @param scene - Babylon.js scene
     * @param config - Optional animation configuration override
     * @returns The animatable that can be used to track animation completion
     */
    static createTrembleAnimation(
        mesh: AbstractMesh,
        velocity: number,
        basePosition: Vector3,
        scene: Scene,
        config = DRUMKIT_CONFIG.animation.tremble
    ) {
        // Calculate trembling intensity based on velocity (1-127 MIDI range)
        const displacement = (velocity / 127) * config.maxDisplacement;
        
        // Create vertical position animation
        const animationPosition = new Animation(
            `trembleAnimation_${mesh.name}_${Date.now()}`,
            "position.y",
            60, // 60 FPS
            Animation.ANIMATIONTYPE_FLOAT,
            Animation.ANIMATIONLOOPMODE_CONSTANT
        );

        const keys = [];
        
        // Start from current position
        keys.push({ frame: 0, value: mesh.position.y });
        
        // Create oscillations with damping
        for (let i = 1; i <= config.numOscillations; i++) {
            const frame = i * (config.totalDuration * 60 / config.numOscillations);
            const damping = Math.pow(config.dampingRate, i - 1);
            const direction = Math.pow(-1, i);
            
            keys.push({
                frame: frame,
                value: basePosition.y + displacement * damping * direction
            });
        }
        
        // Return to base position
        keys.push({ frame: config.totalDuration * 60, value: basePosition.y });

        animationPosition.setKeys(keys);
        
        // Apply smooth easing
        const easingFunction = new CubicEase();
        easingFunction.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
        animationPosition.setEasingFunction(easingFunction);

        // Apply the animation
        mesh.animations = [];
        mesh.animations.push(animationPosition);
        
        const animatable = scene.beginAnimation(
            mesh, 
            0, 
            config.totalDuration * 60, 
            false,
            1.0
        );
        
        // Ensure mesh returns to base position when done
        animatable.onAnimationEnd = () => {
            mesh.position.y = basePosition.y;
        };
        
        return animatable;
    }

    /**
     * Create a specialized tremble animation for hi-hat
     * Includes upward bounce effect after downward displacement
     * 
     * @param mesh - The hi-hat mesh to animate
     * @param velocity - MIDI velocity (1-127) determining animation intensity
     * @param basePosition - Original position to return to
     * @param scene - Babylon.js scene
     * @returns The animatable that can be used to track animation completion
     */
    static createHiHatTrembleAnimation(
        mesh: AbstractMesh,
        velocity: number,
        basePosition: Vector3,
        scene: Scene
    ) {
        const config = DRUMKIT_CONFIG.animation.hiHat;
        const displacement = (velocity / 127) * config.maxDisplacement;
        
        const animationPosition = new Animation(
            `hiHatTrembleAnimation_${Date.now()}`,
            "position.y",
            60,
            Animation.ANIMATIONTYPE_FLOAT,
            Animation.ANIMATIONLOOPMODE_CONSTANT
        );

        const keys = [];
        
        keys.push({ frame: 0, value: mesh.position.y });
        
        // Create oscillations with upward bounce
        for (let i = 1; i <= config.numOscillations; i++) {
            const frame = (i * 2 - 1) * (config.totalDuration * 60 / (config.numOscillations * 2));
            const nextFrame = i * 2 * (config.totalDuration * 60 / (config.numOscillations * 2));
            const damping = Math.pow(config.dampingRate, i - 1);
            
            // Downward displacement
            keys.push({ 
                frame: frame, 
                value: basePosition.y - displacement * damping
            });
            
            // Upward bounce
            keys.push({ 
                frame: nextFrame, 
                value: basePosition.y + displacement * damping * config.upwardBounce
            });
        }
        
        // Return to base position
        keys.push({ frame: config.totalDuration * 60, value: basePosition.y });

        animationPosition.setKeys(keys);
        
        const easingFunction = new CubicEase();
        easingFunction.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
        animationPosition.setEasingFunction(easingFunction);

        mesh.animations = [];
        mesh.animations.push(animationPosition);
        
        const animatable = scene.beginAnimation(
            mesh, 
            0, 
            config.totalDuration * 60, 
            false,
            1.0
        );
        
        animatable.onAnimationEnd = () => {
            mesh.position.y = basePosition.y;
        };
        
        return animatable;
    }
}
