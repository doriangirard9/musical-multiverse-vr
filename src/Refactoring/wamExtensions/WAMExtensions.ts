import { NoteExtension } from "./notes/NoteExtension.js";
import { PatternExtension } from "./patterns/PatternExtension.js";
import { VideoExtension } from "./video/VideoExtension.js";

export type WAMExtensions = {
    notes?: NoteExtension
    patterns?: PatternExtension
    video?: VideoExtension
}

declare global {
    interface Window { WAMExtensions: WAMExtensions; }
}

window.WAMExtensions = window.WAMExtensions || {};