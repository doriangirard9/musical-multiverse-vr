import { Node, Observable } from "@babylonjs/core";

/**
 * Fix of some badly implemented babylonjs features.
 */
export class BabylonsJSFix {

    static fix(){

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
        const old_add = Observable.prototype.add
        Observable.prototype.add = function(this:any, callback: any, ...other: any[]){
            if(callback==null || callback==undefined) return old_add.call(this, callback, ...other) as any
            const safe_callback = (...params: any[]) => {
                try{
                    callback(...params)
                }catch(e: Error|any){
                    console.error("Error in observable callback", e?.message, e?.stack)
                }
            }
            callback._safe_fix_version = safe_callback
            return old_add.call(this, safe_callback, ...other) as any
        }

        // Solution: Wrap the callback in a try/catch to avoid stopping other observers
        const old_add_once = Observable.prototype.add
        Observable.prototype.addOnce = function(this:any, callback: any, ...other: any[]){
            if(callback==null || callback==undefined) return old_add_once.call(this, callback, ...other) as any
            const safe_callback = (...params: any[]) => {
                try{
                    callback(...params)
                }catch(e: Error|any){
                    console.error("Error in observable callback", e?.message, e?.stack)
                }
            }
            callback._safe_fix_version = safe_callback
            return old_add_once.call(this, safe_callback, ...other) as any
        }

        const old_removeCallback = Observable.prototype.removeCallback
        Observable.prototype.removeCallback = function(this:any, callback: any, ...other: any[]){
            if(callback==null || callback==undefined) return old_removeCallback.call(this, callback, ...other) as any
            const ret = old_removeCallback.call(this, callback._safe_fix_version, ...other)
            delete callback._safe_fix_version
            return ret
        }
    }
}