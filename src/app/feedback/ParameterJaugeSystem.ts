import { Node3DNetwork } from "../../network/Node3DNetwork"
import { SceneManager } from "../SceneManager"
import { Node3DInstance } from "../../node3d/instance/Node3DInstance"
import { JaugeMenu } from "../../menus/JaugeMenu"
import { N3DParameterInstance } from "../../node3d/instance/N3DParameterInstance"
import { ValueMenu } from "../../menus"



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
        readonly scenes: SceneManager,
        nodes: Node3DNetwork,
    ){
        for(const [_,node] of nodes.nodes.entries()) this.registerNode(node)
        nodes.onNodeAdded.add(node=>this.registerNode(node))
    }

    private registerNode(node: Node3DInstance){
        const menus = new Map<N3DParameterInstance,ParameterJauge>()

        // Show and hide
        node.onParameterShow.add(parameter=>{
            const jauge = new ParameterJauge(this,parameter)
            jauge.follow(7)
            menus.set(parameter, jauge)
            jauge.menu.name = parameter.config.getLabel()
            jauge.menu.valueText = parameter.config.stringify(parameter.getValue())
            if("value" in jauge.menu) jauge.menu.value = parameter.normalize(parameter.getValue())
        })

        node.onParameterHide.add(param=>{
            const menu = menus.get(param)
            if(menu){
                menus.delete(param)
                menu.dispose()
            }
        })

        const update = (event:{parameter:N3DParameterInstance, value:number})=>{
            const jauge = menus.get(event.parameter)
            if(!jauge) return
            jauge.menu.name = event.parameter.config.getLabel()
            jauge.menu.valueText = event.parameter.config.stringify(event.value)
            if("value" in jauge.menu) jauge.menu.value = event.parameter.normalize(event.value)
            return jauge
        }

        // Update value
        node.onParameterDragStart.add(event=>{
            update(event)?.follow(6)
        })

        node.onParameterDrag.add(event=>{
            update(event)
        })

        node.onParameterDragStop.add(event=>{
            update(event)?.follow(7)
        })
    }

}

class ParameterJauge{

    menu
    following: ()=> void = ()=>{}
    currentDistance = -1

    constructor(
        system: ParameterJaugeSystem,
        private parameter: N3DParameterInstance
    ){
        this.menu = parameter.isSwitch
            ? new ValueMenu(system.scenes.getScene(), system.scenes.getUtilityScene())
            : new JaugeMenu(system.scenes.getScene(), system.scenes.getUtilityScene())
    }

    follow(distance: number){
        if(this.currentDistance === distance) return
        this.currentDistance = distance
        this.following()
        const o = this.menu.followPosition(
            ()=> this.parameter.config.meshes[0].getAbsolutePosition(),
            distance
        )
        this.following = ()=>o.remove()
    }

    dispose(){
        this.following()
        this.menu.dispose()
    }
}

