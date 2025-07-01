import { Color3, HighlightLayer, Mesh, Node } from "@babylonjs/core";

/**
 * Classe intermédiaire pour gérer les effets de surbrillance.
 * Garantie la suppression des effets de surbrillance à la destruction et
 * ajoute quelques méthodes utiles.
 */
export class N3DHighlighter{

    private highlighteds = new Set<Mesh>()

    constructor(
        readonly layer: HighlightLayer
    ){}

    highlight(node: Node, color: Color3){
        if(node instanceof Mesh){
            this.layer.addMesh(node,color)
            this.highlighteds.add(node)
        }
        for(const child of node.getChildren()) this.highlight(child,color)
    }

    unhighlight(node: Node){
        if(node instanceof Mesh && this.highlighteds.delete(node)){
            this.layer.removeMesh(node)
        }
        for(const child of node.getChildren()) this.unhighlight(child)
    }

    binded(){
        return {
            highlight: this.highlight.bind(this),
            unhighlight: this.unhighlight.bind(this),
        }
    }

    dispose(){
        for(const mesh of this.highlighteds) this.layer.removeMesh(mesh)
        this.highlighteds.clear()
    }

}