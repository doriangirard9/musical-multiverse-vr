import { Node, Observable, TransformNode, Vector3 } from "@babylonjs/core";
import { Node3dManager } from "../../app/Node3dManager";
import { N3DShared } from "../../node3d/instance/N3DShared";
import { N3DShopPreviewer } from "./N3DShopPreviewer";
import { N3DShopCamera } from "./N3DShopCamera";
import { InputManager } from "../../xr/inputs/InputManager";
import { N3DPreviewer } from "../N3DPreviewer";
import { parallel } from "../../utils/utils";

export interface N3DShopOptions{
    kinds?: string[],
    categories?: Record<string, string[]>,
}

export interface N3DShopObject {
    name: string,
    type: string,
    options: any,
    location: {
        parent: Node,
        position:Vector3, rotation:Vector3, scaling: Vector3,
        absolutePosition: Vector3, absoluteRotation: Vector3, absoluteScaling: Vector3,
    }
}

export interface N3DShopType {
    create(object: N3DShopObject, shop: N3DShop): Promise<()=>Promise<void>>
    dispose?(shop: N3DShop): Promise<void>
}

const TYPES: Record<string, new()=>N3DShopType> = {
    "display": N3DShopPreviewer,
    "camera": N3DShopCamera,
}

/**
 * A node3D shop.
 * Take a mesh as input, find all subnode whome names starts with "placement", and replace
 * them with nodes3D previews.
 * 
 * To choose the placement that will be used first, the placement are sorted by their name in alphabetical order.
 */
export class N3DShop {


    private types: Record<string, N3DShopType> = {}

    private zoneMap: Record<string,{
        objects: N3DShopObject[],
        dispose?: ()=>Promise<void>
    }> = {}

    readonly root

    private chain: Promise<void> = Promise.resolve()

    readonly on_start_drag = new Observable<N3DPreviewer>()

    constructor(
        target: TransformNode,
        readonly shared: N3DShared,
        readonly node3DManager: Node3dManager,
        readonly inputs: InputManager,
        readonly shopOptions: N3DShopOptions = {},
    ){
        for(const mesh of target.getChildMeshes(false)){
            try{
                const splitted = mesh.name.split(".")
                if(splitted.length!=3)continue

                // Get object informations
                const [type,json,name] = splitted
                const realJson = json
                    .replace("'",'"') // Relaxed single quote
                    .replace(/"?([a-z0-9A-Z_]+)"?\s*:\s*/g, '"$1": ') // Relaxed key
                    .replace(/\s*:\s*"?([a-zA-Z][a-z0-9A-Z_]*)"?/g, ': "$1"') // Relaxed value
                    .replace(/"\s*"/g,'", "') // Relaxed absent commas
                    .replace(/(?<=[,{]\s*)([a-z0-9A-Z_]+)(?=\s*[,}])/g,'"$1":true') // Relaxed boolean without value

                const options = JSON.parse(realJson) as any
                
                const zone = options.zone ?? "default"

                mesh.scaling.x*=-1
                
                const location: N3DShopObject['location'] = {
                    position: mesh.position.clone(),
                    absolutePosition: mesh.absolutePosition.clone(),

                    rotation: mesh.rotationQuaternion ? mesh.rotationQuaternion.toEulerAngles() : mesh.rotation.clone(),
                    absoluteRotation: mesh.absoluteRotationQuaternion.toEulerAngles(),
                    
                    scaling: mesh.scaling.clone().scaleInPlace(2),
                    absoluteScaling: mesh.absoluteScaling.clone().scaleInPlace(2),

                    parent: mesh.parent!!,
                }
                
                // Create a panel
                this.zoneMap[zone] ??= {objects: []}

                // Add object to the zone
                this.zoneMap[zone].objects.push({ location, name, type, options })

                mesh.dispose()
            }catch(e){

            }
        }

        this.root = target
    }

    get zones(){
        return Object.keys(this.zoneMap)
    }

    get showns(){
        return Object.entries(this.zoneMap) .filter(it=>!!it[1].dispose) .map(it=>it[0])
    }

    get hiddens(){
        return Object.entries(this.zoneMap) .filter(it=>!it[1].dispose) .map(it=>it[0])
    }

    getZoneInfo(zone: string){
        return this.zoneMap[zone]
    }

    async showZone(zone: string, deactivateds: string[] = []){
        const chain = this.chain
        return this.chain = (async()=>{
            await this.hideZone(zone)
            await chain
            const z = this.zoneMap[zone]
            console.log(z)
            const disposers = await Promise.all(z.objects.map(async(object)=>{
                if(deactivateds.includes(object.type)) return async()=>{}

                let type = this.types[object.type]
                if(!type){
                    const factory = TYPES[object.type]
                    if(!factory) return async()=>{}

                    type = this.types[object.type] = new factory()
                    if(!type) return async()=>{}
                }

                return await type.create(object,this)
            }))
            z.dispose = async()=>{
                await Promise.all(disposers.map(d=>d?.()))
            }
        })()
    }

    async hideZone(zone: string){
        const chain = this.chain
        return this.chain = (async()=>{
            await chain
            const z = this.zoneMap[zone]
            if(!z?.dispose)return
            await z.dispose()
            z.dispose = undefined
        })()
    }

    async dispose(){
        await this.chain
        await Promise.all(Object.values(this.zoneMap).map(async(z)=>{
            if(z.dispose) await z.dispose()
            z.objects = []
            z.dispose = undefined
        }))
        await Promise.all(Object.values(this.types).map(async(type)=>{
            if(type.dispose)await type.dispose(this)
        }))
    }

    static BASE_OPTIONS: N3DShopOptions = {
        kinds: [
            "livepiano", "maracas", "audiooutput", "oscillator", "notesbox",
            "modal", "tiny54", "voxamp", "flute", "disto_machine", "guitar", "kverb",
        ],
        categories: {
            generator: ["livepiano", "oscillator", "notesbox", "maracas"],
            instrument: ["tiny54", "flute", "guitar", "modal"],
            effect: ["voxamp", "disto_machine", "kverb"],
            technical: ["audiooutput"],
        }
    }

    static LARGE_SHOP_MODEL_URL: string
    static BASE_SHOP_MODEL_URL: string
}

await parallel(
    async()=>{
        N3DShop.LARGE_SHOP_MODEL_URL = (await import("./large_music_shop.glb?url")).default
    },
    async()=>{
        N3DShop.BASE_SHOP_MODEL_URL = (await import("./base_music_shop.glb?url")).default
    },
)