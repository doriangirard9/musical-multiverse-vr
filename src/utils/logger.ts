/**
 * Small namespaced logger for WAM Jam Party.
 *
 * Goals
 *  - One concise, tagged channel: `logger.info("[Shop] opened")` → `[Shop] opened`.
 *  - A single global level so the console can be made quiet (default) or verbose
 *    on demand, without editing call sites.
 *  - A global filter (installConsoleFilter) that *also* gates the hundreds of
 *    pre-existing raw `console.log/info/debug` calls scattered across the code,
 *    so the console is clean by default. `console.warn` / `console.error` are
 *    never suppressed.
 *
 * Runtime control (from the browser devtools console):
 *    wamjamLog.setLevel("debug")   // show everything
 *    wamjamLog.setLevel("warn")    // default — only warnings & errors
 *    wamjamLog.getLevel()
 * The choice is remembered in localStorage ("wamjam.logLevel").
 */

export type LogLevelName = "debug" | "info" | "warn" | "error" | "silent";

const ORDER: Record<LogLevelName, number> = {
    debug: 0, info: 1, warn: 2, error: 3, silent: 4,
};

const STORAGE_KEY = "wamjam.logLevel";
const DEFAULT_LEVEL: LogLevelName = "warn";

function readStoredLevel(): LogLevelName {
    try {
        const s = localStorage.getItem(STORAGE_KEY) as LogLevelName | null;
        if (s && s in ORDER) return s;
    } catch { /* localStorage unavailable */ }
    return DEFAULT_LEVEL;
}

let currentLevel: number = ORDER[readStoredLevel()];
let currentName: LogLevelName = readStoredLevel();

export function setLogLevel(name: LogLevelName): void {
    if (!(name in ORDER)) return;
    currentName = name;
    currentLevel = ORDER[name];
    try { localStorage.setItem(STORAGE_KEY, name); } catch { /* ignore */ }
}

export function getLogLevel(): LogLevelName { return currentName; }

/** True when messages at `level` should be shown given the current threshold. */
function enabled(level: number): boolean { return level >= currentLevel && currentLevel < ORDER.silent; }

/** A logger bound to a short tag, e.g. Logger.get("Shop"). */
export class Logger {
    private prefix: string;
    private constructor(tag: string) { this.prefix = `[${tag}]`; }

    static get(tag: string): Logger { return new Logger(tag); }

    debug(...args: unknown[]): void { if (enabled(ORDER.debug)) originalConsole.debug(this.prefix, ...args); }
    info(...args: unknown[]): void { if (enabled(ORDER.info)) originalConsole.info(this.prefix, ...args); }
    warn(...args: unknown[]): void { if (enabled(ORDER.warn)) originalConsole.warn(this.prefix, ...args); }
    error(...args: unknown[]): void { if (enabled(ORDER.error)) originalConsole.error(this.prefix, ...args); }
}

// Keep references to the real console methods so the logger keeps working even
// after installConsoleFilter() has replaced the global ones.
const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

let filterInstalled = false;

/**
 * Replace console.log / console.info / console.debug with level-gated versions
 * so the existing raw logging across the codebase respects the global level.
 * console.warn and console.error are left untouched. Idempotent.
 */
export function installConsoleFilter(): void {
    if (filterInstalled) return;
    filterInstalled = true;

    console.log = (...args: unknown[]) => {
        // Drop the wam3dgenerator memory-allocation spam (single bare numbers).
        if (args.length === 1 && typeof args[0] === "number") return;
        if (enabled(ORDER.info)) originalConsole.log(...args);
    };
    console.info = (...args: unknown[]) => { if (enabled(ORDER.info)) originalConsole.info(...args); };
    console.debug = (...args: unknown[]) => { if (enabled(ORDER.debug)) originalConsole.debug(...args); };
    // warn/error intentionally left as-is.

    // Expose a tiny runtime control surface on window.
    (globalThis as unknown as { wamjamLog?: unknown }).wamjamLog = {
        setLevel: setLogLevel,
        getLevel: getLogLevel,
        levels: Object.keys(ORDER),
    };
}
