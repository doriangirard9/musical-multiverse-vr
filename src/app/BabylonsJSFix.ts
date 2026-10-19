import { Node, Observable } from "@babylonjs/core";

/**
 * Fix of some badly implemented babylonjs features.
 */
export class BabylonsJSFix {

    static fix(){
        // Patching twice would stack the wrappers, as a hot reload would do
        if((Observable.prototype as any)._babylonjs_fixed) return
        ;(Observable.prototype as any)._babylonjs_fixed = true

        //// Bad behavior implementation ////
        // Solution: I remove the behavior from the list before calling detach
        Node.prototype.removeBehavior = function(this:any, behavior){
            const index = this._behaviors.indexOf(behavior)
            if (index === -1) {
                return this;
            }

            const b = this._behaviors[index]
            if(!this._no_remove_behaviors)this._behaviors.splice(index, 1) 
            b.detach()
                        
            return this
        }

        // Solution: Freeze the behaviors list when disposing the node
        const old_dispose = Node.prototype.dispose
        Node.prototype.dispose = function(this:any, doNotRecurse?: boolean, disposeMaterialAndTextures?: boolean){
            this._no_remove_behaviors = true
            const result = old_dispose.call(this, doNotRecurse, disposeMaterialAndTextures)
            delete this._no_remove_behaviors
            return result
        }


        //// Observer stopping all other oversables early ////
        // Solution: Wrap the callback in a try/catch to avoid stopping other observers
        // The wrapper keeps the original callback in _original, so removeCallback can still find it.
        // addOnce is not patched: it already goes through add.
        const old_add = Observable.prototype.add
        Observable.prototype.add = function(this:any, callback: any, ...other: any[]){
            if(callback==null || callback==undefined) return old_add.call(this, callback, ...other) as any
            const safe_callback = function(this:any, ...params: any[]){
                try{
                    return callback.apply(this, params)
                }catch(e: Error|any){
                    console.error("Error in observable callback", e?.message, e?.stack)
                }
            } as any
            safe_callback._original = callback
            return old_add.call(this, safe_callback, ...other) as any
        }

        // Solution: Compare with the original callback instead of the wrapper
        // Mirrors Observable.removeCallback of babylonjs 8.56
        Observable.prototype.removeCallback = function(this:any, callback: any, scope?: any){
            for(const observer of this._observers){
                if(observer._willBeUnregistered) continue
                const original = observer.callback._original ?? observer.callback
                if(original === callback && (!scope || scope === observer.scope)){
                    this._deferUnregister(observer)
                    return true
                }
            }
            return false
        }
    }
}