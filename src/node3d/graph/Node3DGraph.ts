/**
 * Abstract graph view over Node3D + connections.
 * Decoupled from BabylonJS, sync, and effects — operates on plain shapes
 * so it can be tested in isolation and consumed by anything (effects, debug,
 * validation) that wants to reason about the graph state without touching
 * the concrete Node3DInstance / N3DConnectionInstance classes.
 */

export type Direction = 'input' | 'output' | 'bidirectional'
export type Role = 'source' | 'effect' | 'sink' | 'standalone' | 'visualizer'

export interface PortView {
    readonly direction: Direction
    /** 'audio' | 'midi' | 'automation' | etc. Used to filter the control plane out of role inference. */
    readonly type: string
    readonly connections: Iterable<EdgeView>
}

export interface NodeView {
    readonly id: string
    readonly tags: ReadonlyArray<string>
    readonly ports: Iterable<PortView>
}

export interface EdgeView {
    readonly id: string
    readonly outputNode: NodeView
    readonly inputNode: NodeView
    readonly outputPort: PortView
    readonly inputPort: PortView
}

/**
 * Tags that mark a node as a user-perceivable terminus — anything that delivers
 * sound, visuals, haptics, or any other observable output to the user.
 * Reaching one of these makes a graph "valid" / "in circuit".
 */
const SINK_TAGS    = new Set([
    'consumer',    // audio output (speaker)
    'visualizer',  // visual output (display, lights, particles, video)
    'haptic',      // haptic feedback
    'presents',    // generic "shows something to the user" — for nodes that don't fit the others
])
const SOURCE_TAGS  = new Set(['generator', 'live_instrument'])
/** Control-plane port types — excluded from structural role inference. */
const CONTROL_TYPES = new Set(['automation'])

export class Node3DGraph {
    /**
     * What part does this node play in the graph?
     * Tags win when present (explicit author intent).
     * Otherwise inferred from port directions, ignoring control-plane ports
     * (automation parameters etc.) so a generator-with-knobs still reads as 'source'.
     */
    roleOf(node: NodeView): Role {
        for (const tag of node.tags) {
            if (tag === 'visualizer') return 'visualizer'
            if (SINK_TAGS.has(tag))   return 'sink'
            if (SOURCE_TAGS.has(tag)) return 'source'
        }

        let hasIn = false, hasOut = false
        for (const port of node.ports) {
            if (CONTROL_TYPES.has(port.type)) continue   // skip automation / control
            if (port.direction === 'input'  || port.direction === 'bidirectional') hasIn  = true
            if (port.direction === 'output' || port.direction === 'bidirectional') hasOut = true
            if (hasIn && hasOut) break
        }
        if (hasIn && hasOut) return 'effect'
        if (hasIn)           return 'sink'
        if (hasOut)          return 'source'
        return 'standalone'
    }

    /** True if there's a forward path from `node` (inclusive) to any sink. */
    canReachSink(node: NodeView): boolean {
        return this._bfs(node, 'forward', n => this.roleOf(n) === 'sink')
    }

    /** True if there's a backward path from `node` (inclusive) to any source. */
    isReachableFromSource(node: NodeView): boolean {
        return this._bfs(node, 'backward', n => this.roleOf(n) === 'source')
    }

    /**
     * An edge is live iff signal can flow through it — i.e. its upstream side
     * is reachable from a source AND its downstream side can reach a sink.
     */
    isLive(edge: EdgeView): boolean {
        return this.isReachableFromSource(edge.outputNode)
            && this.canReachSink(edge.inputNode)
    }

    /**
     * A node is "in a valid path" iff it sits on a complete source→sink chain.
     * Drives the "full effect on the node" decision: nodes in a valid path
     * play their full character; nodes that don't are muted/dim.
     *
     * Sources are valid iff they can reach a sink; sinks are valid iff a source can reach them;
     * effects are valid iff both directions hold.
     */
    inValidPath(node: NodeView): boolean {
        return this.isReachableFromSource(node) && this.canReachSink(node)
    }

    private _bfs(start: NodeView, direction: 'forward' | 'backward', stop: (n: NodeView) => boolean): boolean {
        if (stop(start)) return true
        const visited = new Set<NodeView>([start])
        const queue: NodeView[] = [start]
        while (queue.length > 0) {
            const cur = queue.shift()!
            for (const port of cur.ports) {
                for (const edge of port.connections) {
                    const isOutgoing = edge.outputNode === cur
                    const isIncoming = edge.inputNode  === cur
                    const next = direction === 'forward'
                        ? (isOutgoing ? edge.inputNode  : null)
                        : (isIncoming ? edge.outputNode : null)
                    if (!next || visited.has(next)) continue
                    if (stop(next)) return true
                    visited.add(next)
                    queue.push(next)
                }
            }
        }
        return false
    }
}
