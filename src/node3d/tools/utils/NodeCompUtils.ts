import { Color3, HighlightLayer, Mesh, Node } from "@babylonjs/core"

export const NodeCompUtils = {

    highlight(layer: HighlightLayer, node: Node, color: Color3){
        for(let m of node.getChildMeshes(false)) if(m instanceof Mesh) layer.addMesh(m, color)
        if(node instanceof Mesh) layer.addMesh(node, color)
    },
    
    unhighlight(layer: HighlightLayer, node: Node){
        for(let m of node.getChildMeshes(false)) if(m instanceof Mesh) layer.removeMesh(m)
        if(node instanceof Mesh) layer.removeMesh(node)
    },
}
    