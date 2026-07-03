import { describe, expect, test } from 'vitest'
import { Direction, EdgeView, Node3DGraph, NodeView, PortView } from './Node3DGraph'

// --- Fixture builders ---

interface MutablePort extends PortView {
    readonly _conns: Set<EdgeView>
}

function port(direction: Direction, type: string = 'audio'): MutablePort {
    const conns = new Set<EdgeView>()
    return { direction, type, connections: conns, _conns: conns }
}

function node(id: string, tags: string[], ...ports: MutablePort[]): NodeView {
    return { id, tags, ports }
}

let edgeIds = 0
function connect(from: NodeView, fromPort: number, to: NodeView, toPort: number): EdgeView {
    const out = [...from.ports][fromPort] as MutablePort
    const inp = [...to.ports][toPort] as MutablePort
    const edge: EdgeView = {
        id: `e${edgeIds++}`,
        outputNode: from, inputNode: to,
        outputPort: out,  inputPort: inp,
    }
    out._conns.add(edge)
    inp._conns.add(edge)
    return edge
}

const graph = new Node3DGraph()


// --- Tests ---

describe('Node3DGraph.roleOf', () => {
    test('"consumer" tag → sink', () => {
        expect(graph.roleOf(node('speaker', ['consumer'], port('input')))).toBe('sink')
    })

    test('"generator" tag → source', () => {
        expect(graph.roleOf(node('osc', ['generator'], port('output')))).toBe('source')
    })

    test('"live_instrument" tag → source', () => {
        expect(graph.roleOf(node('keyboard', ['live_instrument'], port('output')))).toBe('source')
    })

    test('structural: only output ports → source', () => {
        expect(graph.roleOf(node('s', [], port('output')))).toBe('source')
    })

    test('structural: only input ports → sink', () => {
        expect(graph.roleOf(node('s', [], port('input')))).toBe('sink')
    })

    test('structural: both directions → effect', () => {
        expect(graph.roleOf(node('s', [], port('input'), port('output')))).toBe('effect')
    })

    test('structural: bidirectional alone → effect', () => {
        expect(graph.roleOf(node('s', [], port('bidirectional')))).toBe('effect')
    })

    test('no ports → standalone', () => {
        expect(graph.roleOf(node('s', []))).toBe('standalone')
    })

    test('tag overrides structure', () => {
        // Has both directions structurally, but tagged as consumer → sink wins
        const weird = node('weird', ['consumer'], port('input'), port('output'))
        expect(graph.roleOf(weird)).toBe('sink')
    })

    test('automation inputs are ignored — oscillator-with-knob remains a source', () => {
        // OscillatorN3D pattern: audio output + automation input (frequency param)
        const osc = node('oscillator', [],
            port('output', 'audio'),
            port('input',  'automation'),  // freq parameter — control plane
        )
        expect(graph.roleOf(osc)).toBe('source')
    })

    test('automation outputs alone → standalone (controller is not in audio graph)', () => {
        // GazeController pattern: only emits automation
        const ctrl = node('gaze', [], port('output', 'automation'))
        expect(graph.roleOf(ctrl)).toBe('standalone')
    })

    test('speaker with monitoring feedback — tag rescues semantic intent', () => {
        // Speaker has audio in (primary) AND audio out (feedback to a modulator)
        // Pure structure -> 'effect'. The 'consumer' tag declares intent → sink.
        const speaker = node('speaker', ['consumer'],
            port('input',  'audio'),
            port('output', 'audio'),
        )
        expect(graph.roleOf(speaker)).toBe('sink')
    })
})


describe('Node3DGraph.canReachSink', () => {
    test('source directly wired to sink', () => {
        const src = node('osc', ['generator'], port('output'))
        const snk = node('spk', ['consumer'], port('input'))
        connect(src, 0, snk, 0)
        expect(graph.canReachSink(src)).toBe(true)
    })

    test('source with no connections cannot reach sink', () => {
        const src = node('osc', ['generator'], port('output'))
        expect(graph.canReachSink(src)).toBe(false)
    })

    test('transitive: source → effect → sink', () => {
        const src = node('osc', ['generator'], port('output'))
        const fx  = node('reverb', ['effect'], port('input'), port('output'))
        const snk = node('spk', ['consumer'], port('input'))
        connect(src, 0, fx, 0)
        connect(fx, 1, snk, 0)
        expect(graph.canReachSink(src)).toBe(true)
        expect(graph.canReachSink(fx)).toBe(true)
    })

    test('dead-ended effect chain → false', () => {
        const src = node('osc', ['generator'], port('output'))
        const fx  = node('reverb', ['effect'], port('input'), port('output'))
        connect(src, 0, fx, 0)
        expect(graph.canReachSink(src)).toBe(false)
        expect(graph.canReachSink(fx)).toBe(false)
    })

    test('cycle without sink terminates and returns false', () => {
        const a = node('a', [], port('input'), port('output'))
        const b = node('b', [], port('input'), port('output'))
        connect(a, 1, b, 0)
        connect(b, 1, a, 0)
        expect(graph.canReachSink(a)).toBe(false)
    })
})


describe('Node3DGraph.isLive', () => {
    test('source → sink edge: live', () => {
        const src = node('osc', ['generator'], port('output'))
        const snk = node('spk', ['consumer'], port('input'))
        const e = connect(src, 0, snk, 0)
        expect(graph.isLive(e)).toBe(true)
    })

    test('every edge in source → fx → sink chain is live', () => {
        const src = node('osc', ['generator'], port('output'))
        const fx  = node('reverb', ['effect'], port('input'), port('output'))
        const snk = node('spk', ['consumer'], port('input'))
        const e1 = connect(src, 0, fx, 0)
        const e2 = connect(fx, 1, snk, 0)
        expect(graph.isLive(e1)).toBe(true)
        expect(graph.isLive(e2)).toBe(true)
    })

    test('orphan: source → effect (no sink downstream)', () => {
        const src = node('osc', ['generator'], port('output'))
        const fx  = node('reverb', ['effect'], port('input'), port('output'))
        const e = connect(src, 0, fx, 0)
        expect(graph.isLive(e)).toBe(false)
    })

    test('orphan: effect → sink (no source upstream)', () => {
        const fx  = node('reverb', ['effect'], port('input'), port('output'))
        const snk = node('spk', ['consumer'], port('input'))
        const e = connect(fx, 1, snk, 0)
        expect(graph.isLive(e)).toBe(false)
    })

    test('parallel paths: orphan branch stays orphan even alongside live one', () => {
        const src    = node('osc', ['generator'], port('output'), port('output'))
        const liveFx = node('liveFx', ['effect'], port('input'), port('output'))
        const orphFx = node('orphFx', ['effect'], port('input'), port('output'))
        const snk    = node('spk', ['consumer'], port('input'))

        const liveEdge1 = connect(src, 0, liveFx, 0)
        const liveEdge2 = connect(liveFx, 1, snk, 0)
        const orphanEdge = connect(src, 1, orphFx, 0)  // dead-ends in orphFx

        expect(graph.isLive(liveEdge1)).toBe(true)
        expect(graph.isLive(liveEdge2)).toBe(true)
        expect(graph.isLive(orphanEdge)).toBe(false)
    })

    test('host can pick profile based on liveness', () => {
        // showcase: how a host would use the graph to drive visual choice
        const src = node('osc', ['generator'], port('output'))
        const snk = node('spk', ['consumer'], port('input'))
        const live = connect(src, 0, snk, 0)

        const orphSrc = node('osc2', ['generator'], port('output'))
        const orphFx  = node('fx',  ['effect'], port('input'), port('output'))
        const orphan = connect(orphSrc, 0, orphFx, 0)

        const profileFor = (e: EdgeView) =>
            graph.isLive(e) ? 'LIVE_TUBE_PROFILE' : 'IDLE_TUBE_PROFILE'

        expect(profileFor(live)).toBe('LIVE_TUBE_PROFILE')
        expect(profileFor(orphan)).toBe('IDLE_TUBE_PROFILE')
    })
})


describe('User-perceivable sinks (visualizer, presents, etc.)', () => {
    test('visualizer tag counts as a sink', () => {
        const viz = node('viz', ['visualizer'], port('input', 'audio'))
        expect(graph.roleOf(viz)).toBe('sink')
    })

    test('presents tag counts as a sink', () => {
        const display = node('display', ['presents'], port('input'))
        expect(graph.roleOf(display)).toBe('sink')
    })

    test('source → visualizer is a valid (live) graph', () => {
        const src = node('osc', ['generator'], port('output', 'audio'))
        const viz = node('viz', ['visualizer'], port('input', 'audio'))
        const e = connect(src, 0, viz, 0)
        expect(graph.isLive(e)).toBe(true)
    })

    test('transitive: source → effect → visualizer is live', () => {
        const src = node('osc',  ['generator'], port('output'))
        const fx  = node('rvb',  ['effect'],    port('input'), port('output'))
        const viz = node('viz',  ['visualizer'], port('input'))
        const e1 = connect(src, 0, fx, 0)
        const e2 = connect(fx,  1, viz, 0)
        expect(graph.isLive(e1)).toBe(true)
        expect(graph.isLive(e2)).toBe(true)
    })

    test('a node split between speaker and visualizer: both branches are live', () => {
        // Source feeds both an audio output AND a visualizer — both branches are valid.
        const src = node('osc', ['generator'], port('output'), port('output'))
        const spk = node('spk', ['consumer'], port('input'))
        const viz = node('viz', ['visualizer'], port('input'))
        const eA = connect(src, 0, spk, 0)
        const eV = connect(src, 1, viz, 0)
        expect(graph.isLive(eA)).toBe(true)
        expect(graph.isLive(eV)).toBe(true)
    })
})


describe('Node3DGraph.inValidPath', () => {
    test('source connected to sink: both nodes in valid path', () => {
        const src = node('osc', ['generator'], port('output'))
        const snk = node('spk', ['consumer'], port('input'))
        connect(src, 0, snk, 0)
        expect(graph.inValidPath(src)).toBe(true)
        expect(graph.inValidPath(snk)).toBe(true)
    })

    test('source with no path to sink: not in valid path', () => {
        const src = node('osc', ['generator'], port('output'))
        expect(graph.inValidPath(src)).toBe(false)
    })

    test('effect mid-chain in valid path: true', () => {
        const src = node('osc', ['generator'], port('output'))
        const fx  = node('fx',  ['effect'],    port('input'), port('output'))
        const snk = node('spk', ['consumer'],  port('input'))
        connect(src, 0, fx, 0)
        connect(fx,  1, snk, 0)
        expect(graph.inValidPath(src)).toBe(true)
        expect(graph.inValidPath(fx)).toBe(true)
        expect(graph.inValidPath(snk)).toBe(true)
    })

    test('orphan effect alongside live chain: orphan is not in valid path', () => {
        const src    = node('osc', ['generator'], port('output'), port('output'))
        const liveFx = node('liveFx', ['effect'], port('input'), port('output'))
        const orphFx = node('orphFx', ['effect'], port('input'), port('output'))
        const snk    = node('spk', ['consumer'], port('input'))
        connect(src, 0, liveFx, 0)
        connect(liveFx, 1, snk, 0)
        connect(src, 1, orphFx, 0)
        expect(graph.inValidPath(liveFx)).toBe(true)
        expect(graph.inValidPath(orphFx)).toBe(false)
    })

    test('host showcase: pick "full" vs "muted" profile per node', () => {
        const src = node('osc', ['generator'], port('output'))
        const viz = node('viz', ['visualizer'], port('input'))
        connect(src, 0, viz, 0)

        const stranded = node('lonely', ['effect'], port('input'), port('output'))

        const profile = (n: NodeView) =>
            graph.inValidPath(n) ? 'FULL_NODE_PROFILE' : 'MUTED_NODE_PROFILE'

        expect(profile(src)).toBe('FULL_NODE_PROFILE')
        expect(profile(viz)).toBe('FULL_NODE_PROFILE')
        expect(profile(stranded)).toBe('MUTED_NODE_PROFILE')
    })
})
