import { Tool } from "./Tool"
import { ToolContext } from "./ToolContext"

/**
 * A kind of tool the user can select, and the way to instantiate it.
 * Kinds are declared by tool files and collected by `ToolSystem`.
 */
export interface ToolKind {

    /** The name shown in the tool selection menu. */
    readonly label: string

    /** What the tool is and how it is played, for the user choosing one. */
    readonly description: string

    /**
     * The url of the picture shown next to the label in the selection menu.
     *
     * @remarks
     * Imported from the folder of the tool with vite's `?url`, so the bundler carries the file.
     * Tools that are variations of one another share a picture.
     */
    readonly thumbnail: string

    /**
     * Tags categorizing the tool.
     * A tag is singular, lowercase, unaccented, spaceless (`_` instead) and in english.
     *
     * @remarks
     * The standard tags, a tool carrying every one that fits:
     *
     *  `"contact"`: Plays the instruments by meeting their matter, with a point that has a place in
     *  the world. (example: a wand)
     *  `"distance"`: Reaches instruments further than the arm goes. (example: the ray)
     *  `"physical"`: What plays is moved by a simulation rather than by the hand, so it keeps going
     *  once the hand stops. (example: the flail)
     *
     *  `"percussive"`: Suited to striking: the gesture is short and its force is what is heard.
     *  `"sustained"`: Suited to holding and rubbing: the gesture stays in the matter.
     *  `"precise"`: One small point, for playing a single control among many.
     *  `"wide"`: Meets a broad piece of matter at once, several points or a line. (example: the arch)
     *
     *  `"adjustable"`: Some dimension of the tool is set by the user, usually squeeze and thumbstick.
     *  `"tool"`: Acts on the application rather than on the instruments: menus, grabbing, drawing.
     *  `"default"`: Fit to be held before the user ever chooses, plain and never surprising.
     */
    readonly tags: readonly string[]

    /**
     * Create the tool for one hand.
     * @param context - The world capabilities of the hand the tool is created for.
     */
    create(context: ToolContext): Tool

}
