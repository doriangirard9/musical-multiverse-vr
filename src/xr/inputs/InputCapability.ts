import type { PointerInput } from "./PointerInput"

/**
 * A capability than can be enabled or disabled.
 * Multiple ways to disable the capability are supported, including stacking, named disabling, and global disabling.
 *
 * It can also be disabled for one pointer only, by name: the capability then stays enabled for
 * the other pointers, and {@link isEnabledFor} tells what one given pointer may do.
 */
export class InputCapability{

        private _forceDisable = false

        private _namedDisabling = new Set<string>()

        private _pointerDisabling = new Map<PointerInput, Set<string>>()

        private _disablingStack = 0

        private _enabled = true

        /** Called when the capability gets disabled for every pointer at once. */
        readonly onDisable = new Set<() => void>()

        /** Called when the capability gets enabled for every pointer at once. */
        readonly onEnable = new Set<() => void>()

        /** Called when the capability gets disabled for one pointer, while staying enabled as a whole. */
        readonly onPointerDisable = new Set<(pointer: PointerInput) => void>()

        /** Called when the capability gets enabled again for one pointer. */
        readonly onPointerEnable = new Set<(pointer: PointerInput) => void>()

        constructor(){}

        private _checkEnabled(){
            const enabled = this._disablingStack <= 0 && !this._forceDisable && this._namedDisabling.size === 0
            if(enabled && !this._enabled) this.onEnable.forEach(f => f())
            else if(!enabled && this._enabled) this.onDisable.forEach(f => f())
            this._enabled = enabled
        }

        /**
         * Disable the capability. Multiple calls to this method will stack, and the capability will only be enabled again when the same number of calls to stackEnable() have been made.
         */
        stackDisable(){
            this._disablingStack++
            this._checkEnabled()
        }

        /**
         * Enable the capability. Multiple calls to this method will stack, and the capability will only be enabled again when the same number of calls to stackDisable() have been made.
         */
        stackEnable(){
            this._disablingStack--
            this._checkEnabled()
        }

        /**
         * Force disable the capability. This will disable the capability regardless of the state of the stack or named disabling.
         */
        forceDisable(){
            this._forceDisable = true
            this._checkEnabled()
        }

        /**
         * Force enable the capability.
         */
        unforceDisable(){
            this._forceDisable = false
            this._checkEnabled()
        }

        isForcedDisabled(){
            return this._forceDisable
        }

        /**
         * Disable the capability for a specific name.
         * The capability is disabled until it is enabled for that name.
         * @param name 
         */
        disableFor(name: string){
            this._namedDisabling.add(name)
            this._checkEnabled()
        }

        /**
         * Enable the capability for a specific name.
         * @param name 
         */
        enableFor(name: string){
            this._namedDisabling.delete(name)
            this._checkEnabled()
        }

        /**
         * Disable the capability for one pointer only, under a name.
         * The other pointers keep it. The pointer gets it back once every name disabling it is lifted.
         */
        disablePointerFor(pointer: PointerInput, name: string){
            let names = this._pointerDisabling.get(pointer)
            if(names === undefined){
                names = new Set()
                this._pointerDisabling.set(pointer, names)
            }
            const wasEnabled = names.size === 0
            names.add(name)
            if(wasEnabled) this.onPointerDisable.forEach(f => f(pointer))
        }

        /**
         * Lift one name disabling the capability for one pointer.
         */
        enablePointerFor(pointer: PointerInput, name: string){
            const names = this._pointerDisabling.get(pointer)
            if(names === undefined || !names.delete(name)) return
            if(names.size === 0){
                this._pointerDisabling.delete(pointer)
                this.onPointerEnable.forEach(f => f(pointer))
            }
        }

        /**
         * Is the capability disabled for this pointer in particular, whatever its state as a whole?
         */
        isPointerDisabled(pointer: PointerInput){
            return this._pointerDisabling.has(pointer)
        }

        /**
         * Check if the capability is currently enabled as a whole, for every pointer that is not
         * disabled on its own.
         */
        isEnabled(){
            return this._enabled
        }

        /**
         * Check if the capability is currently enabled for one pointer: enabled as a whole, and not
         * disabled for that pointer.
         */
        isEnabledFor(pointer: PointerInput){
            return this._enabled && !this._pointerDisabling.has(pointer)
        }

}
