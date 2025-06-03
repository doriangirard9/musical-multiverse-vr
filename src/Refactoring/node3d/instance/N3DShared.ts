import { Color3, HighlightLayer, Scene, StandardMaterial } from "@babylonjs/core";
import * as tools from "../tools"
import * as babylonjs from "@babylonjs/core"
import { UIManager } from "../../app/UIManager";
import { N3DMenuManager } from "./utils/N3DMenuManager";

export class N3DShared{

    constructor(
        readonly scene: Scene,
        readonly audioContext: AudioContext,
        readonly groupId: string,
    ){}



    readonly highlightLayer = new HighlightLayer(`node3D highlight layer`, this.scene)
 
    readonly materialMat = (()=>{
        const mat = new StandardMaterial("node3d shared material mat")
        mat.specularColor = Color3.Black()
        return mat
    })()

    readonly materialShiny = (()=>{
        const mat = new StandardMaterial("node3d shared material shiny")
        mat.specularColor = Color3.White()
        return mat
    })()

    readonly materialMetal = (()=>{
        const mat = new StandardMaterial("node3d shared material metal")
        mat.specularColor = Color3.White()
        mat.roughness = 0.2
        return mat
    })()

    readonly materialLight = (()=>{
        const mat = new StandardMaterial("node3d shared material light")
        mat.emissiveColor = Color3.White()
        return mat
    })()

    readonly tools = tools

    readonly babylon = babylonjs

    readonly menuManager = new N3DMenuManager(UIManager.getInstance())
}