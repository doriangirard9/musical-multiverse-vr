import { SERVER_NAME } from "../../options"

/** Delay before the first reconnection attempt, doubled at each failure up to the max */
const FIRST_RETRY_MS = 1500
const MAX_RETRY_MS = 15_000

/**
 * The WebSocket address of a path served by the API server.
 *
 * The path is appended to SERVER_NAME rather than resolved against it: in production the server
 * lives under a prefix (`…/config`), and resolving an absolute path would drop it, as the REST
 * calls, built as `${SERVER_NAME}/api/…`, do not.
 */
export function serverSocketUrl(path: string): string {
    const base = (SERVER_NAME || window.location.origin).replace(/\/+$/, "")
    const url = new URL(`${base}${path}`)
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
    return url.toString()
}

/**
 * The delays between reconnection attempts: 1.5 s, then doubling up to 15 s, so a server that
 * does not answer is not hammered, and back to 1.5 s once a connection opens.
 */
export class ReconnectDelay {
    private failures = 0

    /** The delay before the next attempt, counting one more failure */
    next(): number {
        const delay = Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** this.failures)
        this.failures++
        return delay
    }

    /** A connection opened: the next failure starts over from the first delay */
    reset(): void {
        this.failures = 0
    }
}
