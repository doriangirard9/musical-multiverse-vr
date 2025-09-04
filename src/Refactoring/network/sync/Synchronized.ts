import { SyncSerializable } from "./SyncSerializable"


export interface Synchronized{

    /**
     * Initialize the synchronizable object.
     * @param id The unique identifier of the synchronizable object.
     * @param set_state A function to called when a state is modified or a new state is added.
     * @param remove_state A function to called when a state is removed.
     */
    initSync(
        id: string,
        set_state: (key:string)=>void,
        remove_state: (key:string)=>void,
    ): Promise<void>

    /**
     * Called after the synchronizable object is no longer synchronized.
     */
    disposeSync(): void

    /**
     * Ask the synchronizable object to initialize its states.
     * The synchronizable objet should call set_state for each state it has. Used for the initial synchronization.
     */
    askStates(): void

    /**
     * Set the state associated with the given key.
     * @param key The key of the state to set.
     * @param value The new value of the state.
     */
    setState(key: string, value: SyncSerializable): Promise<void>

    /**
     * Remove the state associated with the given key.
     * @param key The key of the state to remove.
     */
    removeState(key: string): Promise<void>

    /**
     * Get the state associated with the given key.
     * @param key The key of the state to get.
     */
    getState(key: string): Promise<SyncSerializable>
    
}