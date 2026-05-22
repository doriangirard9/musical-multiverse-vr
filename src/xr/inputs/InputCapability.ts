
/**
 * A capability than can be enabled or disabled.
 * Multiple ways to disable the capability are supported, including stacking, named disabling, and global disabling.
 */
export class InputCapability{

        private _forceDisable = false

        private _namedDisabling = new Set<string>()

        private _disablingStack = 0

        private _enabled = true

        readonly onDisable = new Set<() => void>()

        readonly onEnable = new Set<() => void>()

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
         * Check if the capability is currently enabled.
         */
        isEnabled(){
            return this._enabled
        }

}