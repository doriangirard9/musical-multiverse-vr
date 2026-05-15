import { AbstractMesh, Material, MaterialDefines, MaterialPluginBase, Mesh, Nullable, PBRMaterial, Scene, ShaderLanguage } from "@babylonjs/core";


export class VertexPlusInstanceColorMaterialPlugin extends MaterialPluginBase{


    constructor(material: Material) {
        super(
            material,
            "VertexPlusInstanceColor",
            100,
            {VERTEX_PLUS_INSTANCE_COLOR:false}
        )
        this._enable(true)
    }

    prepareDefines(_defines: MaterialDefines, _scene: Scene, _mesh: AbstractMesh): void {
        if(_defines["VERTEXCOLOR"])_defines["VERTEX_PLUS_INSTANCE_COLOR"] = true
    }

    getClassName(): string {
        return "VertexPlusInstanceColorMaterialPlugin"
    }

    isCompatible(shaderLanguage: ShaderLanguage): boolean {
        return shaderLanguage === ShaderLanguage.GLSL
    }

    getAttributes(_attributes: string[], _scene: Scene, _mesh: AbstractMesh): void {
        _attributes.push("color2")
    }

    getCustomCode(_shaderType: string, _shaderLanguage?: ShaderLanguage): Nullable<{ [pointName: string]: string; }> {
        if(_shaderType==="vertex"){
            return {
                CUSTOM_VERTEX_DEFINITIONS: `
                    #ifdef VERTEX_PLUS_INSTANCE_COLOR
                    in vec4 color2;
                    #endif
                `,
                CUSTOM_VERTEX_MAIN_END: `
                    #ifdef VERTEX_PLUS_INSTANCE_COLOR
                    vColor.rgb *= color2.rgb;
                    #endif
                `,
            }
        }
        return null
    }

}