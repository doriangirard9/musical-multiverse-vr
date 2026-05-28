import { Color3 } from "@babylonjs/core";
import { NetworkManager } from "../network/NetworkManager";
import { RandomUtils } from "../node3d/tools/utils/RandomUtils";
import { Avatar, AvaterShared } from "../world/avatar/Avatar";
import { InputManager } from "../xr/inputs/InputManager";
import { SceneManager } from "./SceneManager";
import { NetworkEventBus } from "../eventBus/NetworkEventBus";
import { SyncManager } from "../network/sync/SyncManager";

/**
 * Show animated avatars representing the players in the world.
 * Each avatar is linked to a player through the NetworkManager, and is synchronized across
 * the network using the SyncManager.
 */
export class AvatarSystem {

    manager
    shared
    avatar!: Avatar

    constructor(
        readonly network: NetworkManager,
        readonly inputs: InputManager,
        readonly scene: SceneManager,
        readonly events: NetworkEventBus,
        readonly username: string,
        readonly usercolor: Color3,
    ){
        const avatars = this

        this.shared = new AvaterShared(scene.getScene())
        this.manager = new SyncManager<Avatar,string>({
            name: "avatars",
            doc: network.doc,
            async on_add(instance) {
                instance.on_dispose = () => avatars.manager.remove(instance)
            },
            async create(_, __) {
                const avatar = new Avatar(avatars.shared)
                await avatar.initialize()
                return avatar
            },
            async on_remove(instance) {
                instance.dispose()
            },
        })
    }

    async initialize(){
        // Current player avatar
        const id = RandomUtils.randomID()
        const avatar = this.avatar = new Avatar(this.shared)
        await avatar.initialize()
        avatar.registerInputs(this.inputs)
        avatar.setVisible(false)
        avatar.randomize_skin()
        avatar.setColor(this.usercolor.toColor4(1))
        avatar.setName(this.username)
        this.manager.add(id, avatar, this.network.connection.getAwareness().getLocalState()!["playerId"] as string)

        this.events.on("PLAYER_DELETED",({playerId})=>{
            for(const [id, _] of this.manager.entries()){
                if(this.manager.getData(id)! === playerId){
                    this.manager.remove(id)
                    break
                }
            }
        })
    }

    private static _instance?: AvatarSystem

    static async initialize(...network: ConstructorParameters<typeof AvatarSystem>){
        this._instance = new AvatarSystem(...network)
        this._instance.initialize()
    }

    static getInstance(): AvatarSystem {
        if(!this._instance) throw new Error("AvatarManager not initialized. Call initialize() first.")
        return this._instance
    }

}