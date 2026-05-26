// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// Commentaire au-dessus uniquement pour le template, à retirer

import {Node3D, Node3DFactory, Node3DGUI, Serializable} from "../Node3D";
import {TransformNode} from "@babylonjs/core";
import {Node3DGUIContext} from "../Node3DGUIContext";
import {Node3DContext} from "../Node3DContext";


export class TemplateN3DGUI implements Node3DGUI {
    root: TransformNode;
    worldSize = 1;

    constructor(context: Node3DGUIContext) {
        const {babylon: B, tools: T} = context;

        this.root = new B.TransformNode("TemplateN3D Root", context.scene);


    }

    dispose(): Promise<void> {
        return Promise.resolve(undefined);
    }
}

export class TemplateN3D implements Node3D {
    constructor(context: Node3DContext, private gui: TemplateN3DGUI) {
        const {tools : T,audioCtx} = context;
    }
    dispose(): Promise<void> {
        return Promise.resolve(undefined);
    }

    getState(key: string): Promise<Serializable | void> {
        return Promise.resolve(undefined);
    }

    getStateKeys(): string[] {
        return [];
    }

    setState(key: string, state: Serializable | undefined): Promise<void> {
        return Promise.resolve(undefined);
    }
}

export const TemplateN3DFactory: Node3DFactory<TemplateN3DGUI, TemplateN3D> ={
    label : "CHANGE ME",
    description : "CHANGE ME",
    tags : ["CHANGE","ME"],

    createGUI: async (context: Node3DGUIContext) : Promise<TemplateN3DGUI> => {
        return new TemplateN3DGUI(context);
    },

    create : async (context: Node3DContext, gui: TemplateN3DGUI) : Promise<TemplateN3D> => new TemplateN3D(context, gui),


}

