
/**
 * A serializable value.
 */
export type SyncSerializable = number
    | string
    | boolean
    | null
    | {[key:string]:SyncSerializable}
    | SyncSerializable[]