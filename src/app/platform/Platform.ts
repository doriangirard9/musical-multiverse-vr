
/**
 * A platform handle the platform specific hooks and events.
 * It connect the platform inputs to the InputManager.
 * It also handle the movement of the camera and the player.
 * It is also responsible of the creation of the camera.
 * @module
 */
export interface Platform{

    /**
     * Do show 3D environment decorations.
     * @default true
     **/
    doShowEnvironment?: boolean

    /**
     * Do create the default lights
     * @default true
     **/
    doCreateDefaultLights?: boolean

}