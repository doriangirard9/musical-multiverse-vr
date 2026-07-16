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
            const jauge = new ParameterJauge(this, parameter)
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

        const update = (event:{parameter:N3DParameterInstance, value:number}, update: (m: ParameterJauge)=>void)=>{
            const jauge = menus.get(event.parameter)
            if(!jauge) return
            update(jauge)
            jauge.menu.name = event.parameter.config.getLabel()
            jauge.menu.valueText = event.parameter.config.stringify(event.value)
            if("value" in jauge.menu) jauge.menu.value = event.parameter.normalize(event.value)
            return jauge
        }

        // Update value
        node.onParameterDragStart.add(event=>{
            update(event, m=>{
                m.follow(6)
                m.isFocused = true
            })
        })

        node.onParameterDrag.add(event=>{
            update(event, m=>{
            })
        })

        node.onParameterDragStop.add(event=>{
            update(event, m=>{
                m.follow(7)
                m.isFocused = false
            })
        })
    }

}

class ParameterJauge{

    jauge?: JaugeMenu
    simple?: ValueMenu
    following: ()=> void = ()=>{}
    currentDistance = -1

    constructor(
        private system: ParameterJaugeSystem,
        private parameter: N3DParameterInstance,
    ){
        this.isFocused = false
    }

    set isFocused(isFocused: boolean){
        if(isFocused){
            this.isSimple = this.parameter.isSwitch
        }
        else this.isSimple = true
    }

    set isSimple(value: boolean){
        if(value){
            if(!this.simple) this.simple = new ValueMenu(this.system.scenes.getScene(), this.system.scenes.getUtilityScene())
        }
        else{
            if(this.simple){
                this.simple.dispose()
                this.simple = undefined
            }
        }

        if(!value){
            if(!this.jauge) this.jauge = new JaugeMenu(this.system.scenes.getScene(), this.system.scenes.getUtilityScene())
        }
        else{
            if(this.jauge){
                this.jauge.dispose()
                this.jauge = undefined
            }
        }

        if(this.currentDistance!=-1){
            const d = this.currentDistance
            this.follow(-1)
            this.follow(d)
        }
    }

    get isSimple(): boolean{
        return !!this.simple
    }

    get menu(): JaugeMenu | ValueMenu {
        if(this.isSimple) return this.simple!
        else return this.jauge!
    }

    follow(distance: number){
        if(this.currentDistance === distance) return
        this.currentDistance = distance

        this.following()
        this.following = ()=>{}

        if(distance === -1) return

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

