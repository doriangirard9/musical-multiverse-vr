

export class PromiseChain{

    private promise: Promise<void> = Promise.resolve()

    then<T>(callback: ()=>Promise<T>): Promise<T>{
        const chainedPromise = this.promise.then(callback)
        this.promise = chainedPromise.then(()=>{})
        return chainedPromise
    }
}