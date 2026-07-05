import { Node3DNetwork } from "../../network/Node3DNetwork"
import { SceneManager } from "../SceneManager"
import { Node3DInstance } from "../../node3d/instance/Node3DInstance"
import { PointerInput } from "../../xr/inputs"
import { JaugeMenu } from "../../menus/JaugeMenu"
import { N3DParameterInstance } from "../../node3d/instance/N3DParameterInstance"



export class ParameterJaugeSystem {


    // Instance
    static _instance?: ParameterJaugeSystem

    static async initialize(...network: ConstructorParameters<typeof ParameterJaugeSystem>){
        this._instance = new ParameterJaugeSystem(...network)
    }

    static getInstance(): ParameterJaugeSystem {
        if(!this._instance) throw new Error("ParameterJaugeSystem not initialized. Call initialize() first.")
        return this._instance
    }


    constructor(
        private scenes: SceneManager,
        nodes: Node3DNetwork,
    ){
        for(const [_,node] of nodes.nodes.entries()) this.registerNode(node)
        nodes.onNodeAdded.add(node=>this.registerNode(node))
    }

    private registerNode(node: Node3DInstance){
        const menus = new Map<N3DParameterInstance,JaugeMenu>()

        node.onParameterDragStart.add(event=>{
            const menu = new JaugeMenu(this.scenes.getScene(), this.scenes.getUtilityScene())
            menu.followPosition(
                () => event.parameter.config.meshes[0].getAbsolutePosition(),
                6
            )
            menus.set(event.parameter, menu)
            menu.name = event.parameter.config.getLabel()
            menu.valueText = event.parameter.config.stringify(event.value)
            menu.value = event.parameter.normalize(event.value)
        })

        node.onParameterDrag.add(event=>{
            const menu = menus.get(event.parameter)
            if(!menu) return
            menu.name = event.parameter.config.getLabel()
            menu.valueText = event.parameter.config.stringify(event.value)
            menu.value = event.parameter.normalize(event.value)
        })

        node.onParameterDragStop.add(event=>{
            const menu = menus.get(event.parameter)
            if(menu){
                menus.delete(event.parameter)
                menu.dispose()
            }
        })
    }

}

