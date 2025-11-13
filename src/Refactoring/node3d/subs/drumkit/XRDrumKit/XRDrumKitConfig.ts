// Central configuration for XR Drum Kit
// All magic numbers and configuration values in one place for easy tuning

export const DRUMKIT_CONFIG = {
    // Physics configuration
    physics: {
        scaleFactor: 0.7, // Scale factor for physics trigger shapes (0.7 = 70% of visual size)
        debounceMs: 50, // Minimum time between hits (50ms = 20 hits/second max)
        minVelocity: 0.05, // Minimum detectable hit (m/s)
        maxVelocity: 3.0, // Maximum expected hit speed (m/s)
        velocityCurve: 0.85, // Power curve for velocity response (0.5 = very sensitive, 1.0 = linear)
        
        // Cymbal-specific physics
        cymbal: {
            mass: 0.5,
            angularDamping: 0.5,
            springStrength: 0.8,
            springDamping: 0.3,
            maxRotationUp: Math.PI / 4, // 45 degrees up
            maxRotationDown: Math.PI * 1.25, // 225 degrees down (5π/4)
            bounceEnergyLoss: 0.7, // Energy retained after bounce (30% loss)
            impulseScale: 0.3, // Scale factor for angular impulse from hits
        }
    },

    wam : {
        //wamUri : "https://www.webaudiomodules.com/community/plugins/burns-audio/drumsampler/index.js"
        wamUri : "https://mainline.i3s.unice.fr/WAMDrumSamplerVel/index.js"
    },
    
    // MIDI key mappings
    midi: {
        keys: {
            kick: 36,
            snare: 38,
            rimshot: 37,
            floorTom: 41,
            midTom: 47,
            highTom: 43,
            crashCymbal: 49,
            rideCymbal: 51,
            closedHiHat: 42,
            openHiHat: 46,
        },
        durations: {
            drums: 0.25, // Duration for drum sounds (seconds)
            cymbals: 5.0, // Duration for cymbal sounds (seconds)
            hiHat: 0.25, // Duration for hi-hat sounds (seconds)
        }
    },
    
    // Animation configuration
    animation: {
        // Tremble animation (drums and hi-hat)
        tremble: {
            maxDisplacement: 0.015, // 1.5cm maximum displacement
            numOscillations: 3,
            totalDuration: 0.3, // seconds
            dampingRate: 0.5, // Damping factor per oscillation
        },
        // Hi-Hat specific animation
        hiHat: {
            maxDisplacement: 0.01, // 1cm maximum displacement
            numOscillations: 3,
            totalDuration: 0.3,
            dampingRate: 0.6,
            upwardBounce: 0.2, // Upward bounce as fraction of downward displacement
        }
    },
    
    // Haptic feedback configuration
    haptics: {
        minIntensity: 0.3,
        maxIntensity: 1.0,
        duration: 100, // milliseconds
    },
    
    // Velocity calculation configuration
    velocity: {
        angularWeight: 0.25, // Weight of angular velocity in combined speed calculation
    },
    
    // Drum kit 3D model configuration
    model: {
        path: "./src/Refactoring/node3d/subs/drumkit/",
        fileName: "drum3DModel.glb",
        scaleFactor: 0.7, // Overall scale for the entire drum kit
    },
    
    // Debug configuration
    debug: {
        showBoundingBoxes: true,
        enablePhysicsViewer: true,
        logCollisions: true,
        logVelocity: true,
    }
};
