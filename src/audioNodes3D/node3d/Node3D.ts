

export interface Node3D{



    //// Set state / Get state / Synchronization ////

    /**
     * Met à jour l'état du Node3D.
     * Supporte une modification partielle de l'état pour optimiser la synchronisation.
     * @param state L'état du Node3D.
     * @param key La clé de l'état à mettre à jour. Si non défini, met à jour tout l'état.
     */
    setState(state: any, key?: string): Promise<void>

    /**
     * Récupère l'état du Node3D.
     * Supporte une récupération partielle de l'état pour optimiser la synchronisation.
     * @param key La clé de l'état à récupérer. Si non défini, récupère tout l'état.
     * @returns L'état du Node3D.
     */
    getState(key?: string): Promise<any>



    //// Lifetime ////

    /**
     * Appelle cette fonction pour libérer les ressources utilisées par le Node3D.
     */
    dispose(): Promise<void>
}


export interface Node3DFactory<T extends Node3D>{

    create(): Promise<T>

}