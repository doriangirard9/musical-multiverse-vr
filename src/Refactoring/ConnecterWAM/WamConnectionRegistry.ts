import {IWamConnectionStrategy} from "./interfaces/IWamConnectionStrategy.ts";
import {AudioConnectionStrategy} from "./AudioConnectionStrategy.ts";
import {MidiConnectionStrategy} from "./MidiConnectionStrategy.ts";
import {PortType} from "./interfaces/EnumConnexionType.ts";

export class WamConnectionRegistry {

    private static _instance: WamConnectionRegistry;
    private readonly strategies: IWamConnectionStrategy[];

    private constructor() {
        this.strategies = [];
        this.registerStrategy(new AudioConnectionStrategy());
        this.registerStrategy(new MidiConnectionStrategy());
    }

    public static getInstance(): WamConnectionRegistry {
        if (!this._instance) {
            this._instance = new WamConnectionRegistry();
        }
        return this._instance;
    }

    /**
     * Est-ce qu'on a vraiment besoin de garder une trace de toutes les stratégies ?
     */
    public registerStrategy(strategy: IWamConnectionStrategy): void {
        this.strategies.push(strategy);
    }

    public unregisterStrategy(strategy: IWamConnectionStrategy): void {
        this.strategies.splice(this.strategies.indexOf(strategy), 1);
    }

    public getStrategy(src: PortType, dst: PortType): IWamConnectionStrategy {
        for (const strategy of this.strategies) {
            if (strategy.canHandle(src, dst)) {
                return strategy;
            }
        }
        throw new Error(`No strategy found for connection from ${src} to ${dst}`);
    }
}