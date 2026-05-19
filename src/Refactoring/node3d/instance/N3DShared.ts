import { Color3, HighlightLayer, Scene, StandardMaterial } from "@babylonjs/core";
import * as tools from "../tools"
import * as babylonjs from "@babylonjs/core"
import { UIManager } from "../../app/UIManager";
import { N3DMenuManager } from "./utils/N3DMenuManager";
import noiseTexture from "./utils/noise.png?url"

export class N3DShared{

    constructor(
        readonly scene: Scene,
        readonly utilityLayer: babylonjs.UtilityLayerRenderer,
        readonly shadowGenerator: babylonjs.ShadowGenerator,
        readonly audioContext: AudioContext,
        readonly audioEngine: babylonjs.AudioEngineV2,
        readonly groupId: string,
    ){
        this.highlightLayer = new HighlightLayer(`node3D highlight layer`, this.scene, {renderingGroupId:0})

        this.materialMat = new StandardMaterial("node3d shared material mat", this.scene)
        this.materialMat.alphaCutOff= 0.5
        this.materialMat.specularColor = Color3.Black()

        this.materialShiny = new StandardMaterial("node3d shared material shiny", this.scene)
        this.materialShiny.specularColor = Color3.White()

        this.materialMetal = new StandardMaterial("node3d shared material metal", this.scene)
        this.materialMetal.specularColor = Color3.White()
        this.materialMetal.roughness = 0.2

        this.materialLight = new StandardMaterial("node3d shared material light", this.scene)
        this.materialLight.emissiveColor = Color3.White()

        {
            const noise = new babylonjs.Texture(noiseTexture, this.scene, {
                noMipmap:true,
                format:babylonjs.Engine.TEXTUREFORMAT_LUMINANCE,
                samplingMode: babylonjs.Texture.NEAREST_NEAREST
            })
            noise.hasAlpha = true
            noise.getAlphaFromRGB = true
            this.materialTransparent = new StandardMaterial("node3d shared material transparent", this.scene)
            this.materialTransparent.opacityTexture = noise
            this.materialTransparent.alphaCutOff= .2
            this.materialTransparent.transparencyMode = babylonjs.Material.MATERIAL_ALPHATEST
            this.materialTransparent.specularColor = Color3.Black()
            this.materialTransparent.backFaceCulling = false
        }
    }

    readonly highlightLayer

    readonly materialMat
    readonly materialShiny
    readonly materialMetal
    readonly materialLight
    readonly materialTransparent

    readonly tools = tools
    readonly babylon = babylonjs

    readonly menuManager = new N3DMenuManager(UIManager.getInstance())
}