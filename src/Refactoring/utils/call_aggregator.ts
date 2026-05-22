
export type Resolvers<T> = [resolve: (v:T)=>void, reject: (e:any)=>void]

/**
 * Alternative to promise chaining that handle parallelable calls.
 * A utility class that aggregates multiple calls to a function into a single call, based on a specified maximum count. When the number of calls reaches the maximum count, the aggregated function is executed with the collected arguments.
 * This help to implement a batching mechanism for functions that can benefit from processing multiple inputs at once, such as rendering or data fetching operations.
 */
export class AsyncCallAggregator<F,T> {

    constructor(
        private maxCount: number,
        private delay: number,
        private call: (args: F[])=>Promise<T[]>,
    ){}

    
    private pendingCalls = new Map<F,Resolvers<T>[]>()
    private nextCalls = new Map<F,Resolvers<T>[]>()
    private whenFinished = new Set<()=>void>()

    private fillNext(){
        for(const [arg, resolvers] of [...this.pendingCalls.entries()]){
            if(this.nextCalls.size < this.maxCount){
                const list = this.nextCalls.get(arg) ?? []
                // Avoid spreading large arrays to prevent blowing the call stack when many resolvers accumulate
                for(const resolver of resolvers){
                    list.push(resolver)
                }
                this.nextCalls.set(arg, list)
                this.pendingCalls.delete(arg)
            }
        }
    }

    private async callNext(){
        const entries = [...this.nextCalls.entries()]
        try{
            const results = await this.call(entries.map(e=>e[0]))
            for(let i=0; i<entries.length; i++){
                const [_, resolvers] = entries[i]
                const result = results[i]
                resolvers.forEach(resolver=>resolver[0](result))
            }
        }catch(e){
            for(const [_, resolvers] of entries){
                resolvers.forEach(resolver=>resolver[1](e))
            }
        }
        this.nextCalls.clear()
    }

    private timeout: any = null
    private computing = false

    private async scheduleCall(){
        // Fill next calls
        if(!this.computing){
            this.fillNext()
        }

        // Compute
        if(this.timeout==null){
            this.timeout = setTimeout(async()=>{
                this.computing = true
                await this.callNext()
                this.timeout = null
                this.computing = false
                if(this.pendingCalls.size>0) this.scheduleCall()
                else{
                    this.whenFinished.forEach(cb=>cb())
                    this.whenFinished.clear()
                }
            },this.delay)
        }
    }

    async add(arg: F): Promise<T>{
        // Resolver
        let resolver: Resolvers<T>
        let promise = new Promise<T>((res, rej)=>{resolver = [res, rej]})

        // Add to pending calls
        const list = this.pendingCalls.get(arg) ?? []
        list.push(resolver!)
        this.pendingCalls.set(arg, list)

        // Schedule call
        this.scheduleCall()

        return promise
    }

    addOnFinish(callback: ()=>void){
        if(this.pendingCalls.size==0 && this.nextCalls.size==0) callback()
        this.whenFinished.add(callback)
    }
}