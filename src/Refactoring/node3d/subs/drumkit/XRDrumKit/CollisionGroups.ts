/**
 * Collision layer definitions for physics filtering optimization
 * 
*/
export const COLLISION_GROUP = {
    NONE: 0,                // 0000 (binary) - No collision group
    DRUMSTICK: 1 << 0,      // 0001 (binary) = 1 - Drumstick physics bodies
    DRUM: 1 << 1,           // 0010 (binary) = 2 - Drum trigger volumes
    CYMBAL: 1 << 2,         // 0100 (binary) = 4 - Cymbal trigger volumes  
} as const;

/**
 * Type for collision group values
 * Ensures only valid collision groups are used
 */
export type CollisionGroupValue = typeof COLLISION_GROUP[keyof typeof COLLISION_GROUP];
