// Central configuration for XR Drum Kit
// All magic numbers and configuration values in one place for easy tuning

export const DRUMKIT_CONFIG = {
    // Physics configuration
    physics: {
        debounceMs: 50, // Minimum time between hits (50ms = 20 hits/second max)
        minVelocity: 0.5, // Minimum detectable hit (m/s)
        maxVelocity: 35.0, // Maximum expected hit speed (m/s) 
        velocityCurve: 0.85, // Power curve for velocity response (0.5 = very sensitive, 1.0 = linear)
        
        // Cymbal-specific physics
        cymbal: {
            mass: 5, // Mass for linear motion (not critical for cymbals that don't move linearly)
            inertia: 4.0, // Moment of inertia - controls rotational resistance (higher = harder to rotate)
            angularDamping: 2, // Higher damping = faster velocity decay after hit
            springStrength: 20.0, // Torsional spring strength to return to rest position
            springDamping: 3, // Reduced from 5 - allows more natural movement
            maxRotationXY: 15 * (Math.PI / 180), // 15 degrees limit on X and Z axes (tilt)
            bounceEnergyRetained: 0.25, // 25% energy retained (75% loss)
            impulseScale: 0.25, // Scale factor for angular impulse from hits 
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
        angularWeight: 0.25, // Weight of angular velocity in combined speed calculation - increased from 0.25 based on testing
    },
    
    // Drumstick pickup configuration
    drumstick: {
        pickupTransitionMs: 200, // Time (ms) to wait before switching from TELEPORT to ACTION prestep
        
        // Drumstick dimensions
        stickLength: 0.4,
        stickDiameter: 0.02,
        ballDiameter: 0.03,
        
        // Physics
        mass: 1,
        
        // Collision detection (drumstick-to-drumstick)
        enableCollisionDetection: true, // Master switch to enable/disable stick collision feature
        showCollisionMesh: false, // Show collision cylinders for debugging/adjustment (set to false when satisfied)
        collisionDebounceMs: 100, // Minimum time between stick collision sounds (ms)
        collisionGracePeriodMs: 500, // Time after pickup before collision detection is active (prevents pickup sound)
        collisionSoundPath: "/sounds/drum_stick.mp3",
        collisionSoundVolume: 0.3,
        
        // Haptic feedback for stick collisions
        collisionHapticIntensity: 0.6, // Vibration intensity (0.0 - 1.0)
        collisionHapticDuration: 100, // Vibration duration (ms)
    },
    
    // Drum kit 3D model configuration
    model: {
        path: "/drum_3D_model/",
        fileName: "drum3DModel.glb",
        scaleFactor: 0.7, // Overall scale for the entire drum kit
    },
    
    // Debug configuration
    debug: {
        showBoundingBoxes: false,
        enablePhysicsViewer: false,
        logCollisions: true,
        logVelocity: true, 
        logCymbalPhysics: false, // cymbal-specific physics debugging
        logDrumstickCollisions: false, // Log drumstick-to-drumstick collisions
    }
};
