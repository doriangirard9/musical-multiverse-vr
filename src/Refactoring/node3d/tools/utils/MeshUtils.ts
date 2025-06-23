import { AbstractMesh, Color4, VertexBuffer } from "@babylonjs/core";

export class MeshUtils{

    private constructor(){}

    static setAllVerticesData(mesh: AbstractMesh, kind: string, data: number[]){
        mesh.setVerticesData(kind, Array.from({length:mesh.getTotalVertices()},()=>data).flat())
    }

    static setColor(mesh: AbstractMesh, color: Color4){
        this.setAllVerticesData(mesh, VertexBuffer.ColorKind, color.asArray())
    }

}