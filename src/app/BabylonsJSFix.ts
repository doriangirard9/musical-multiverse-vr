import { Node } from "@babylonjs/core";

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
    }
}