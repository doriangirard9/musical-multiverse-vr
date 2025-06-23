import { SyncSerializable } from "./SyncSerializable"


export interface Synchronized{

    /**
     * Initialize the synchronizable object.
     * @param id 
     * @param set_state 
     * @param remove_state 
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
     * The synchronizable objet should call setState for each state it has.
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