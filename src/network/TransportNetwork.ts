import * as Y from 'yjs';
import { WamTransportManager } from "../app/node3d/WamTransportManager.ts";

/**
 * Shares the tempo and the time signature of the transport between the participants, through the
 * "transport" map of the shared document.
 *
 * Only these two are shared. Play and stop stay with each participant, and so does the position:
 * everyone plays from their own clock, at the same tempo.
 *
 * The map is also what the session saves and reloads (see SessionConnector), so writing it is
 * enough to restore a saved tempo for everyone.
 */
export class TransportNetwork {

    /** Keys of the shared map */
    static readonly TEMPO = "tempo";
    static readonly NUMERATOR = "numerator";
    static readonly DENOMINATOR = "denominator";

    readonly map: Y.Map<number>;

    /** Set while a shared value is being applied, so applying it is not published back */
    private _applying = false;

    /** Whether the transport is being changed by a value that came from the others, rather than by this participant */
    get applying(): boolean { return this._applying; }

    constructor(private readonly doc: Y.Doc, private readonly transport: WamTransportManager) {
        this.map = doc.getMap<number>("transport");

        // A session already playing has its values in the map: take them. An empty map is left
        // empty, rather than filled with this participant's defaults, which would override the
        // values of the others once the document is synchronized.
        this.applyShared();
        this.map.observe(event => {
            if (event.transaction.origin !== this) this.applyShared();
        });

        transport.onChange(() => this.publish());
    }

    /** Apply the shared values to the local transport */
    private applyShared(): void {
        const tempo = this.map.get(TransportNetwork.TEMPO);
        const numerator = this.map.get(TransportNetwork.NUMERATOR);
        const denominator = this.map.get(TransportNetwork.DENOMINATOR);

        this._applying = true;
        try {
            if (typeof tempo === "number") this.transport.setTempo(tempo);
            if (typeof numerator === "number" && typeof denominator === "number") {
                this.transport.setTimeSignature(numerator, denominator);
            }
        } finally {
            this._applying = false;
        }
    }

    /** Write the local values to the map, if they differ from it */
    private publish(): void {
        if (this._applying) return;

        const { numerator, denominator } = this.transport.getTimeSignature();
        const values: [string, number][] = [
            [TransportNetwork.TEMPO, this.transport.getTempo()],
            [TransportNetwork.NUMERATOR, numerator],
            [TransportNetwork.DENOMINATOR, denominator],
        ];
        const changed = values.filter(([key, value]) => this.map.get(key) !== value);
        if (changed.length === 0) return;

        this.doc.transact(() => {
            for (const [key, value] of changed) this.map.set(key, value);
        }, this);
    }
}
