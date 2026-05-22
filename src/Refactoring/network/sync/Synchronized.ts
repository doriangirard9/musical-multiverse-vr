import { SyncSerializable } from "./SyncSerializable"

/**
 * A synchronizable object.
 * A synchronizable object is an object that can be synchronized across the network.
 * It can have multiple states, each identified by a key. The state can be of any type that can be serialized (number, string, boolean, null, object, array).
 * 
 * Example of usage:
 * ```ts
 * class Sphere extends Synchronized{
 * 
 *   constructor(
 *    private color: string
 *    private position: {x:number,y:number,z:number} 
 *   ){}
 * 
 *   set_state: (key:string) => void = () => {}
 *   remove_state: (key:string) => void = () => {}
 *      
 *   initSync(
 *    id: string,
 *    set_state: (key:string)=>void,
 *    remove_state: (key:string)=>void,
 *   ): Promise<void>{
 *    this.set_state = set_state
 *    this.remove_state = remove_state
 *   }
 * 
 *   disposeSync(): void{
 *    this.set_state = ()=>{}
 *    this.remove_state = ()=>{}
 *   }
 * 
 *   askStates(){
 *    this.set_state("color")
 *    this.set_state("position")
 *   }
 * 
 *   setState(key: string, value: SyncSerializable): Promise<void>{
 *    if(key=="color") this.color = value as string
 *    else if(key=="position") this.position = value as {x:number,y:number,z:number}
 *   }
 * 
 *   getState(key: string): Promise<SyncSerializable>{
 *    if(key=="color") return this.color
 *    else if(key=="position") return this.position
 *   }
 * 
 *   removeState(key: string): Promise<void>{
 *   }
 * 
 *   set color(color: string){
 *    this.color = color
 *    this.set_state("color")
 *   }
 * 
 *   set position(position: {x:number,y:number,z:number}){
 *    this.position = position
 *    this.set_state("position")
 *   }
 * }
 * ```
 */
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