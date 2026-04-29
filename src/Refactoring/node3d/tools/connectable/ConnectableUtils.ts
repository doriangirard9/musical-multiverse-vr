import { CreateGeodesic, CreateSphere, Mesh } from "@babylonjs/core";


export namespace ConnectableUtils {

    /**
     * Create a standard mesh to use as an input connection point.
     * @param name 
     * @param size 
     * @returns A mesh to use as an input connection point.
     */
    export function createInputMesh(name: string, size: number): Mesh {
        return CreateGeodesic(name, { size }, null)
    }

    /**
     * Create a standard mesh to use as an output connection point.
     * @param name
     * @param size
     * @returns A mesh to use as an output connection point.
     */
    export function createOutputMesh(name: string, size: number): Mesh {
        return CreateSphere(name, { diameter:size }, null)
    }
}