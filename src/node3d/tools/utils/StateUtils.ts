import { Node3D } from "../../Node3D";

export class StateUtils{
    private constructor(){}

    static async getCompleteState(node: Node3D): Promise<Record<string, any>> {
        const promises = node.getStateKeys() .map(key=>node.getState(key).then(v=>[key,v] as [string,any]))
        const states = await Promise.all(promises)
        const map = Object.fromEntries(states)
        return map
    }

    static async setCompleteState(node: Node3D, state: Record<string, any>): Promise<void> {
        const promises = Object.entries(state).map(([key, value]) => node.setState(key, value))
        await Promise.all(promises)
    }
}