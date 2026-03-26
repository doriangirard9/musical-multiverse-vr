

export class AutoDispose<T>{

    constructor(
        private create: ()=>Promise<T>,
        private dispose: (instance:T)=>Promise<void>,
        private lifetime: number = 60_000
    ){}

    private instance?: T
    private timeout?: any

    async get(){
        if(this.instance){
            clearTimeout(this.timeout)
            this.timeout = setTimeout(()=>this.disposeInstance(), this.lifetime)
            return this.instance
        }
        else{
            const instance = this.instance = await this.create()
            this.timeout = setTimeout(()=>this.disposeInstance(), this.lifetime)
            return instance
        }
    }

    async disposeInstance(){
        if(this.instance){
            await this.dispose(this.instance)
            this.instance = undefined
        }
    }
}