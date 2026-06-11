import { AbstractMesh, Color3 } from "@babylonjs/core";
import { Node3DConnectable } from "../../Node3DConnectable";

/**
 * Sync protocol: propagates timing information between connected nodes.
 * Timing cascades: output → input → upstream output → etc.
 */
export namespace SynxN3DConnectable {

    export const Color = Color3.FromHexString("#fff700")

    /**
     * Connection object linking an Input to an Output
     */
    export interface SyncConnection {
        input: Container
        output: Container
    }

    /**
     * Container holding timing state with propagation logic
     */
    export class Container {
        private _start = 0
        private _duration = 0
        private _upstreams = new Set<Container>()
        private _downstreams = new Set<Container>()

        constructor(duration: number) {
            this._duration = duration
        }

        get start() { return this._start }
        get duration() { return this._duration }
        
        /**
         * Total is always the maximum end time in the entire chain
         */
        get total() {
            return this.getRootContainers()[0]?.calculateGlobalTotal() ?? (this._start + this._duration)
        }

        set duration(value: number) {
            this._duration = value
            this.propagateDownstream()
        }

        /**
         * Register an output that connects to this input
         * An input can have multiple upstreams
         */
        connectToUpstream(upstreamContainer: Container) {
            this._upstreams.add(upstreamContainer)
            upstreamContainer._downstreams.add(this)
            this.propagateDownstream()
        }

        /**
         * Disconnect from a specific upstream
         */
        disconnectFromUpstream(upstreamContainer: Container) {
            this._upstreams.delete(upstreamContainer)
            upstreamContainer._downstreams.delete(this)
            this.propagateDownstream()
        }

        /**
         * Find all root containers (containers with no upstream)
         */
        private getRootContainers(): Container[] {
            if (this._upstreams.size === 0) {
                return [this]
            }
            const roots = new Set<Container>()
            for (const upstream of this._upstreams) {
                upstream.getRootContainers().forEach(r => roots.add(r))
            }
            return Array.from(roots)
        }

        /**
         * Calculate the global total (max end time in entire chain)
         */
        private calculateGlobalTotal(): number {
            let maxEnd = this._start + this._duration
            for (const downstream of this._downstreams) {
                maxEnd = Math.max(maxEnd, downstream.calculateGlobalTotal())
            }
            return maxEnd
        }

        /**
         * Recalculate start as the maximum end time of all upstreams
         */
        private propagateDownstream() {
            if (this._upstreams.size > 0) {
                // Start after all upstreams have finished
                let maxUpstreamEnd = 0
                for (const upstream of this._upstreams) {
                    maxUpstreamEnd = Math.max(maxUpstreamEnd, upstream._start + upstream._duration)
                }
                this._start = maxUpstreamEnd
            } else {
                // Root container: keep at 0
                this._start = 0
            }
            
            // Propagate to all downstreams sequentially
            let offset = this._start + this._duration
            for (const downstream of this._downstreams) {
                downstream._start = offset
                offset += downstream._duration
            }
        }
    }

    /**
     * Input connectable for sync protocol
     */
    export class Input implements Node3DConnectable {
        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly container: Container,
        ) { }

        get type() { return "sync" }
        get direction() { return "input" as const }
        get color() { return Color }

        connectAsInput(): SyncConnection {
            return { input: this.container, output: this.container }
        }

        connectAsOutput(_: SyncConnection): void { }
        disconnectAsInput(_: SyncConnection): void { }
        disconnectAsOutput(_: SyncConnection): void { }
    }

    /**
     * Output connectable for sync protocol
     */
    export class Output implements Node3DConnectable {
        constructor(
            readonly id: string,
            readonly meshes: AbstractMesh[],
            readonly label: string,
            readonly container: Container,
        ) { }

        get type() { return "sync" }
        get direction() { return "output" as const }
        get color() { return Color }

        connectAsInput(): any {
            return {}
        }

        connectAsOutput(connection: SyncConnection): void {
            // Output adopts input's duration
            this.container.duration = connection.input.duration
            // Input connects to this output as upstream
            connection.input.connectToUpstream(this.container)
        }

        disconnectAsInput(_: any): void { }

        disconnectAsOutput(connection: SyncConnection): void {
            connection.input.disconnectFromUpstream(this.container)
        }
    }
}
