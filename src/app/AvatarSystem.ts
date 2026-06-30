import { Color3, Observer, Vector3 } from "@babylonjs/core";
import { NetworkManager } from "../network/NetworkManager";
import { RandomUtils } from "../node3d/tools/utils/RandomUtils";
import { Avatar, AvaterShared } from "../world/avatar/Avatar";
import { InputManager } from "../xr/inputs/InputManager";
import { SceneManager } from "./SceneManager";
import { NetworkEventBus } from "../eventBus/NetworkEventBus";
import { SyncManager } from "../network/sync/SyncManager";
import { XRManager } from "../xr/XRManager";

/** Distance below which another avatar is hidden (in meters) */
const PROXIMITY_HIDE_DISTANCE = 1.0;

/**
 * Show animated avatars representing the players in the world.
 * Each avatar is linked to a player through the NetworkManager, and is synchronized across
 * the network using the SyncManager.
 */
export class AvatarSystem {

    manager
    shared
    avatar!: Avatar
    private _proximityObserver?: Observer<any>

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

        // Start proximity-based transparency for other avatars
        this._startProximityFade()
    }

    /**
     * Offset the XR camera spawn position so new players don't overlap existing avatars.
     * Called after entering XR. Checks existing avatar positions and shifts if too close.
     */
    public offsetSpawnIfNeeded() {
        try {
            const xrManager = XRManager.getInstance()
            if (!xrManager?.xrHelper?.baseExperience?.camera) return

            const camera = xrManager.xrHelper.baseExperience.camera
            const cameraPos = camera.position.clone()

            // Collect positions of all OTHER avatars
            const otherPositions: Vector3[] = []
            for (const [, otherAvatar] of this.manager.entries()) {
                if (otherAvatar === this.avatar) continue
                const headPos = otherAvatar.getHeadPosition?.()
                if (headPos) otherPositions.push(headPos)
            }

            if (otherPositions.length === 0) return

            // Check if we're too close to any other avatar
            const MIN_DISTANCE = 2.0 // meters
            let tooClose = otherPositions.some(pos => 
                Vector3.Distance(cameraPos, pos) < MIN_DISTANCE
            )

            if (tooClose) {
                // Try offsets in a circle around current position
                const offsets = [
                    new Vector3(MIN_DISTANCE, 0, 0),
                    new Vector3(-MIN_DISTANCE, 0, 0),
                    new Vector3(0, 0, MIN_DISTANCE),
                    new Vector3(0, 0, -MIN_DISTANCE),
                    new Vector3(MIN_DISTANCE, 0, MIN_DISTANCE),
                    new Vector3(-MIN_DISTANCE, 0, MIN_DISTANCE),
                    new Vector3(MIN_DISTANCE, 0, -MIN_DISTANCE),
                    new Vector3(-MIN_DISTANCE, 0, -MIN_DISTANCE),
                ]

                for (const offset of offsets) {
                    const candidate = cameraPos.add(offset)
                    const farEnough = otherPositions.every(pos => 
                        Vector3.Distance(candidate, pos) >= MIN_DISTANCE
                    )
                    if (farEnough) {
                        // Shift the XR reference space
                        const refSpace = xrManager.xrHelper.baseExperience.sessionManager.referenceSpace
                        if (refSpace && 'getOffsetReferenceSpace' in refSpace) {
                            const xrOffset = new XRRigidTransform({
                                x: -offset.x, y: 0, z: -offset.z
                            })
                            const newRefSpace = refSpace.getOffsetReferenceSpace(xrOffset)
                            xrManager.xrHelper.baseExperience.sessionManager.referenceSpace = newRefSpace
                            console.log(`[AvatarSystem] Spawn offset applied: ${offset.toString()}`)
                        }
                        break
                    }
                }
            }
        } catch (e) {
            console.warn('[AvatarSystem] Could not offset spawn position:', e)
        }
    }

    /**
     * Hide other avatars when the local player's head is too close to them.
     * Prevents seeing the inside of avatar 3D models.
     */
    private _startProximityFade() {
        const scene = this.scene.getScene()
        
        this._proximityObserver = scene.onBeforeRenderObservable.add(() => {
            // Get local player head position from InputManager (updated every frame by camera observer)
            const localHeadPos = this.inputs.head.origin
            if (!localHeadPos || (localHeadPos.x === 0 && localHeadPos.y === 0 && localHeadPos.z === 0)) return

            // Check each other avatar
            for (const [, otherAvatar] of this.manager.entries()) {
                if (otherAvatar === this.avatar) continue
                
                const otherHeadPos = otherAvatar.getHeadPosition()
                if (!otherHeadPos) continue

                const distance = Vector3.Distance(localHeadPos, otherHeadPos)
                otherAvatar.setProximityHidden(distance < PROXIMITY_HIDE_DISTANCE)
            }
        })
    }

    findAvatarByPlayerId(playerId: string): Avatar | undefined {
        for (const [id, avatar] of this.manager.entries()) {
            if (this.manager.getData(id) === playerId) {
                return avatar
            }
        }
        return undefined
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
