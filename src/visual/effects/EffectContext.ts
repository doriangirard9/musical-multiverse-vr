import { AbstractMesh, Color4, Scene } from "@babylonjs/core"

export interface EffectContext {
    readonly primaryMesh: AbstractMesh
    readonly secondaryMesh: AbstractMesh | null
    getColor(): Color4
    readonly scene: Scene
}
