export default class VideoExtension {
    constructor() {
        this.delegates = new Map()
        this.connections = new Map()
    }

    setDelegate(pluginId, delegate) {
        if (delegate) {
            this.delegates.set(pluginId, delegate)
        } else {
            this.delegates.delete(pluginId)
        }
    }

    getDelegate(pluginId) {
        return this.delegates.get(pluginId)
    }
}
