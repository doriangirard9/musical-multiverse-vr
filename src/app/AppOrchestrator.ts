import {NetworkEventBus} from "../eventBus/NetworkEventBus.ts";
import {UIEventBus} from "../eventBus/UIEventBus.ts";

import {IOEventBus} from "../eventBus/IOEventBus.ts";


export class AppOrchestrator{
    private static instance: AppOrchestrator | null = null;

    private NetworkEventBus : NetworkEventBus | null = null;

    private constructor() {}

    static async initialize(){
        this.instance = new AppOrchestrator();
        this.instance.NetworkEventBus = NetworkEventBus.getInstance();
        IOEventBus.getInstance();
    }

    public static getInstance(): AppOrchestrator {
        if (!this.instance) throw new Error("AppOrchestrator not initialized. Call initialize() first.")
        return this.instance
    }
}