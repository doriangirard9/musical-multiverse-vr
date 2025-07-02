import { N3DPreviewer } from "../N3DPreviewer";
import { N3DShop, N3DShopObject, N3DShopType } from "./N3DShop";

export class N3DShopPreviewer implements N3DShopType {

    private shown = new Set<string>()

    kinds = new Map<any,string>()

    async create(object: N3DShopObject, shop: N3DShop): Promise<() => Promise<void>> {
        const {shopOptions, node3DManager, shared} = shop
        const {options, location} = object

        // Get a kinds
        let kind = null as string|null
        console.log(options)
        if(options.kind){
            kind = options.kind
        }
        else{
            if(!this.kinds.has(object)){
                let kinds = [] as string[]
                if(options.category && shopOptions.categories) kinds = shopOptions.categories[options.category] ?? []
                else kinds = shopOptions.kinds ?? []

                // Filter
                if(!options.unfiltered) kinds = kinds.filter(k=>!this.shown.has(k))
                
                // Get one
                let kind = null as string|null
                if(kinds.length === 0) kind = null
                else if(options.unsorted) kind = kinds[0]
                else if(options.alphabetical) kind = kinds.sort((a,b)=>a.localeCompare(b))[0]
                else kind = kinds[Math.floor(Math.random()*kinds.length)]

                if(kind!=null){
                    this.shown.add(kind)
                    this.kinds.set(object, kind)
                }
            }
            kind = this.kinds.get(object)??null
        }

        if(!kind) return async()=>{}

        // Test if exists
        if((await node3DManager.builder.getFactory(kind))==null)return async()=>{}

        // Show it
        console.log("show kind ", kind)
        const preview = new N3DPreviewer(shared, kind, node3DManager, false)
        await preview.initialize()
        preview.root.parent = location.parent
        preview.root.position.copyFrom(location.position)
        preview.root.rotation.copyFrom(location.rotation)
        preview.root.scaling.copyFrom(location.scaling)
        preview.root.rotationQuaternion = null
        preview.on_start_drag = () => {
            shop.on_start_drag.notifyObservers(preview)
        }

        return async()=>{
            preview.dispose()
        }
    }

}