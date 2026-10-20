/**
 * What a tool does: a set of behaviors and a visual bound to one controller.
 *
 * @remarks
 * An tool binds all its inputs and creates all its meshes at construction, from its
 * {@link ToolContext}, and releases everything it created in {@link dispose}. Only one tool
 * lives per hand at a time, so a leaked observer keeps acting under the next tool.
 */
export interface Tool {

    /** Release every observer, behavior and mesh created by the tool. */
    dispose(): void

}
