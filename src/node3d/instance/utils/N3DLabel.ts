import { N3DConnectableInstance } from "../N3DConnectableInstance";
import { N3DConnectionInstance } from "../N3DConnectionInstance";
import { N3DParameterInstance } from "../N3DParameterInstance";
import { Node3DInstance } from "../Node3DInstance";

/**
 * Utilities for generating human-readable names for node3d objects.
 */
export namespace N3DLabel{

    /**
     * Generates a human-readable name for a Node3D instance.
     * @returns Human-readable name for a Node3D instance
     **/
    export function node(node: Node3DInstance){
        return node.factory.label
    }

    /**
     * Generates a human-readable name for a Node3D connectable instance.
     * @returns Human-readable name for a Node3D connectable instance
     **/
    export function connectable(conn: N3DConnectableInstance){
        return conn.instance.factory.label+" "+conn.config.label
    }

    /**
     * Generates a human-readable name for a Node3D connection instance.
     * @param origin The Node3D instance that is the origin of the connection. If not provided, the direction of the connection will be inferred from the connectable instances.
     * @returns Human-readable name for a Node3D connection instance
     **/
    export function connection(conn: N3DConnectionInstance, origin?: Node3DInstance){

        if(!origin){
            if(!conn.inputConnectable) return "Invalid connection"
            origin = conn.inputConnectable.instance
        } 
        
        if(!conn.inputConnectable) return "Invalid connection"
        if(!conn.outputConnectable) return "Invalid connection"

        let from
        let to
        if(conn.inputConnectable?.instance==origin){
            from = conn.inputConnectable
            to = conn.outputConnectable
        }
        else if(conn.outputConnectable?.instance==origin){
            from = conn.outputConnectable
            to = conn.inputConnectable
        }
        else return "Invalid connection"

        let symbol
        if(from.config.direction=="output" || to.config.direction=="input") symbol = "→"
        else if(from.config.direction=="input" || to.config.direction=="output") symbol = "←"
        else symbol = "↔"

        return `${connectable(from)} ${symbol} ${connectable(to)}`
    }

    /**
     * Generates a human-readable name for a Node3D parameter instance.
     * @returns Human-readable name for a Node3D parameter instance
     **/
    export function parameter(param: N3DParameterInstance){
        return param.node3d.factory.label+" "+param.config.getLabel()
    }



}