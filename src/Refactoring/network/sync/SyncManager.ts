import { Synchronized } from "./Synchronized";
import { SyncSerializable } from "./SyncSerializable";
import * as Y from "yjs";

export class SyncManager<
    T extends Synchronized,
    D extends SyncSerializable|undefined = undefined
>{

    private shared_data
    private shared_state

    private doc
    private create
    private on_add
    private on_remove
    private send_interval
    private get_timeout

    constructor(options: {
            name: string,
            doc: Y.Doc,
            create: (id:string, state: {get(key:string):SyncSerializable|undefined}, data: D) => Promise<T>,
            on_add?: (instance: T, state: {get(key:string):SyncSerializable|undefined}, data: D) => Promise<void>,
            on_remove?: (instance: T, state: {get(key:string):SyncSerializable|undefined}, data: D) => Promise<void>,
            send_interval?: number,
            get_timeout?: number,
        },
    ){
        this.doc = options.doc
        this.create = options.create
        this.on_add = options.on_add
        this.on_remove = options.on_remove
        this.send_interval = options.send_interval ?? 100
        this.get_timeout = options.get_timeout ?? 1000
        this.shared_state =  options.doc.getMap<Y.Map<SyncSerializable>>()
        this.shared_data = options.doc.getMap<{data:D}>(options.name)
        this.shared_data.observe(this.add_from_network.bind(this))
    }

    private instances = new Map<string, T>()
    private reverse_instances = new Map<T,string>()

    /**
     * Add a new instance to the registry.
     * @param id 
     * @param instance 
     * @param data 
     */
    async add(id:string, instance: undefined extends D ? T : never): Promise<void>;
    async add(id:string, instance: T, data: D): Promise<void>;
    async add(id:string, instance: T|never, data?: D){

        console.log("new ",id,instance)
        const resolve = this.get_resolver(id)

        // Add the instance to the registry
        this.instances.set(id, instance)
        this.reverse_instances.set(instance,id)

        const state = new Y.Map<SyncSerializable>()
        
        // Initialize the synchronizable
        this.initialize(id, instance, state)

        // Get the state
        instance.askStates()
        const changes = await this.get_changes_and_remove(id)
        for(const change of changes){
            if("remove" in change) state.delete(change.remove)
            else state.set(change.set, change.value)
        }

        // Write in shared
        this.doc.transact(() => {
            console.log("send")
            this.shared_state.set(id, state)
            this.shared_data.set(id, {data:data as D})
        },this)
        
        this.on_add?.(instance, state, data as D)

        resolve(instance)
    }

    /**
     * Remove an instance from the registry.
     * @param id
     * @param instance
     * @param data
     */
    async remove(id_or_instance:string|T){
        const id = typeof id_or_instance == "string" ? id_or_instance : this.reverse_instances.get(id_or_instance)
        if(id===undefined)return

        const shared_state = this.shared_state.get(id)
        const shared_data = this.shared_data.get(id)
        const instance = typeof id_or_instance == "string" ? this.instances.get(id_or_instance) : id_or_instance
        if(instance===undefined)return
        
        if(!shared_data || !shared_state){
            console.warn(`SyncManager : Shared data for instance ${id} not found when removing`)
            return
        }
        if(!instance){
            console.warn(`SyncManager : Instance ${id} not found when removing`)
            return
        }

        // Remove the pending modifications
        this.pendingStateChange.delete(id)

        // Call the cleanup function
        await this.on_remove?.(instance, shared_state, shared_data.data)

        // Remove the instance
        this.instances.delete(id)
        this.reverse_instances.delete(instance)
        
        this.doc.transact(()=>{
            this.shared_data.delete(id)
        },this)
    }



    //// From Network ////
    private async add_from_network(event: Y.YMapEvent<{data:D}>){
        if(event.transaction.origin==this)return

        for(const [id,{action,oldValue}] of event.keys){
            if(action=="delete"){
                // Remove the instance
                const instance = this.instances.get(id)!! //TODO: Peut être mettre une vérification plutôt que ça.
                this.instances.delete(id)
                this.reverse_instances.delete(instance)

                // Clear pending state change
                this.pendingStateChange.delete(id)

                // Get share data
                const {data,state} = oldValue as {data:D, state: Y.Map<SyncSerializable>}
                this.on_remove?.(instance!!, state, data)
            }
            else if(action=="add"){
                console.log("new sync added", this.shared_data.get(id))
                const resolve = this.get_resolver(id)

                const new_shared_state = this.shared_state.get(id)!!
                const new_shared = this.shared_data.get(id)!!

                // Create instance
                const instance = await this.create(id, new_shared_state, new_shared.data)
                this.instances.set(id,instance)
                this.reverse_instances.set(instance,id)
                console.log("added to instance ",id)
                await this.initialize(id,instance,new_shared_state)
                await Promise.all([...new_shared_state.entries()].map(([key,value])=>{
                    return instance.setState(key as string,value as SyncSerializable)
                }))

                resolve(instance)
            }
            else{
                console.warn(`SyncManager : New instance with same id is not allowed`)
            }
        }
    }



    //// State synchronization ////
    private pendingStateChange = new Map<string, Map<string,"remove"|"add">>()
    private timeout?: any

    private addChange(id:string, key:string, type:"remove"|"add"){
        console.log("add change", id, key, type)
        const state_changes = this.pendingStateChange.get(id) ?? new Map<string,"remove"|"add">()
        this.pendingStateChange.delete(id)
        this.pendingStateChange.set(id, state_changes)

        state_changes.delete(key)
        state_changes.set(key, type)
        
        if(!this.timeout){
            const self = this
            this.timeout = setTimeout(async function timeoutFn(){
                await self.send_changes()
                if(self.pendingStateChange.size>0) self.timeout=setTimeout(timeoutFn,self.send_interval)
                else self.timeout = undefined
            },this.send_interval)
        }
    }

    /**
     * Initialise un objet qui doit être synchronisé.
     * @param id 
     * @param instance 
     */
    private async initialize(id: string, instance: T, shared: Y.Map<SyncSerializable>){
        // L'instance peut indiquer des changements d'état
        // Les changements sont enregistrés dans une liste et seront envoyé ensemble d'un coups.
        await instance.initSync(
            id,
            (key:string) => { this.addChange(id, key, "add") },
            (key:string) => { this.addChange(id, key, "remove") },
        )

        // Synchronisation des états
        shared.observe(async(event: Y.YMapEvent<SyncSerializable>)=>{
            console.log("on shared state change", id, event)
            if(event.transaction.origin==this)return

            console.log("on state change", [...event.keys].map(it=>it[0]))

            for(const [key,{action}] of event.keys){
                const newValue = shared.get(key)
                if(action=="delete"){
                    await instance.removeState(key as string)
                }
                else if(action=="add" || action=="update"){
                    await instance.setState(key as string, newValue!!)
                }
            }
        })
    }

    /**
     * Récupère les changements d'état en attente d'une instance et vide la liste
     * des changements en attente.
     * @param id Ge
     * @returns 
     */
    private async get_changes_and_remove(id: string): Promise<({remove:string}|{set:string,value:SyncSerializable})[]>{
        const instance = this.instances.get(id)
        const shared = this.shared_data.get(id)

        if(!instance){
            console.warn(`SyncManager : Instance ${id} not found when getting changes`)
            return []
        }
        if(!shared){
            console.warn(`SyncManager : Shared data for instance ${id} not found when getting changes`)
            return []
        }

        const changes = this.pendingStateChange.get(id)
        if(!changes) return []
        this.pendingStateChange.delete(id)

        const ret = [] as ({remove:string}|{set:string,value:SyncSerializable})[]
    
        await Promise.all([...changes].map(async([key,type])=>{
            if(type=="add"){
                const value = await instance.getState(key)
                ret.push({set:key,value})
            }
            else{
                ret.push({remove:key})
            }
        }))

        return ret
    }

    /**
     * Envoie tous les changements en attentes dans le réseau.
     * @param id 
     * @param instance 
     */
    private async send_changes(){
        console.log("send changes")
        // Parcours les changements
        for(const [id, _] of this.pendingStateChange.entries()){
            console.log("send all changes of ", id, Object.fromEntries(_))
            const instance = this.instances.get(id)
            const shared = this.shared_data.get(id)
            const shared_state = this.shared_state.get(id)
            if(!instance){
                console.warn(`SyncManager : Instance ${id} not found when sending changes`)
                continue
            }
            if(!shared || !shared_state){
                console.warn(`SyncManager : Shared data for instance ${id} not found when sending changes`)
                continue
            }

            const computed_changes = await this.get_changes_and_remove(id)

            this.doc.transact(() => {
                for(const change of computed_changes){
                    console.log("send a change ", id, change)
                    if("remove" in change) shared_state.delete(change.remove as string)
                    else shared_state.set(change.set, change.value)
                }
            },this)
        }
    }


    //// Getters ////
    private pendingGet = new Map<string, Set<{resolve:(value:T|undefined)=>void, timeout:any}>>()

    /**
     * Get an instance from its ID, synchronously now or undefinid if the instance does not exit
     * @param id R The id of the instance
     * @returns The instane with this id or undefined if it does not exist
     */
    public getInstanceNow(id: string): T | undefined {
        return this.instances.get(id)
    }

    /**
     * Get the id of an instance
     * @param instance The instance
     * @returns The id of the instance
     */
    public getId(instance: T){
        return this.reverse_instances.get(instance)
    }

    /**
     * Get an instance from its ID asynchronously, if the instance does not exit, it wait some time for the instance
     * to be registred.
     * @param id The id of the instance to get
     * @param timeout
     * @returns 
     */
    public async getInstance(id: string, timeout?: number): Promise<T | undefined> {
        const final_timeout = timeout ?? this.get_timeout

        // Get it now
        const instance = this.getInstanceNow(id)
        if(instance!=undefined)return instance

        // Wait till its loaded
        let resolve!: (value:T|undefined)=>void
        const promise = new Promise<T|undefined>((resolveFn) => {
            resolve = resolveFn
        })

        const timeoutfn = setTimeout(()=>{
            this.pendingGet.get(id)?.delete(entry)
            if(this.pendingGet.size==0) this.pendingGet.delete(id)

            const instance = this.getInstanceNow(id)
            resolve(instance)
        },final_timeout)

        const entry = {resolve, timeout:timeoutfn}

        const list = this.pendingGet.get(id) ?? new Set<{resolve:(value:T|undefined)=>void, timeout:any}>()
        this.pendingGet.set(id, list)
        list.add(entry)

        return promise
    }

    private get_resolver(id: string): (instance:T|undefined)=>void {
        const list = this.pendingGet.get(id)
        if(!list)return ()=>{}

        const resolvers = [] as ((value:T|undefined)=>void)[]
        for(const entry of list){
            clearTimeout(entry.timeout)
            resolvers.push(entry.resolve)
        }
        list.clear()
        this.pendingGet.delete(id)
        return (instance:T|undefined) => resolvers.forEach(resolve => resolve(instance))
    }

}
