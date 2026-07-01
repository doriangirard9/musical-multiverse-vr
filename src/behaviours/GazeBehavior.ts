import {
    AbstractMesh,
    Behavior,
    Nullable,
    Observer,
    Scene,

} from "@babylonjs/core"
import { InputManager } from "../xr/inputs/InputManager"

enum GazeState {
    IDLE,
    GAZING,
    ACTIVATED
}

export class GazeBehavior implements Behavior<AbstractMesh> {
    public name = "GazeBehavior"
    private static readonly DEBUG_LOG = false

    public onGazeStart: () => void = () => {}
    public onGazeActivated: () => void = () => {}
    public onGazeStop: () => void = () => {}
    public onCustomCheck: () => boolean = () => true

    /**
     * Le délai (en ms) que l'utilisateur doit fixer l'objet pour déclencher l'activation.
     */
    public activationDelay: number = 1500
    /**
     * L'intervalle (en ms) entre chaque vérification de la direction du regard.
     */
    public checkInterval: number = 100

    /**
     * Le nœud auquel ce comportement est attaché.
     * @private
     */
    private _attachedNode: Nullable<AbstractMesh> = null
    private _scene: Nullable<Scene> = null
    private _inputs = InputManager.getInstance()
    private _renderObserver: Nullable<Observer<Scene>> = null

    /**
     * L'état actuel du behavior.
     * @private
     */
    private _gazeState: GazeState = GazeState.IDLE
    private _gazeStartTime: number = 0


    /**
     * Le temps de la dernière mise à jour.
     * @private
     */
    private _lastCheckTime: number = 0
    private _isCurrentlyGazing: boolean = false

    public get attachedNode(): Nullable<AbstractMesh> {
        return this._attachedNode
    }

    public init(): void {}

    /**
     * Attache le behavior à un nœud spécifique.
     * @param target
     */
    public attach(target: AbstractMesh): void {
        this._attachedNode = target
        this._scene = this._attachedNode.getScene()

        this._renderObserver = this._scene.onBeforeRenderObservable.add(() => {
            if (Date.now() - this._lastCheckTime > this.checkInterval) {
                this._performCheck()
            }

            const isGazingNow = this._isCurrentlyGazing && this.onCustomCheck()

            if (isGazingNow) {
                if (this._gazeState === GazeState.IDLE) {
                    this._changeState(GazeState.GAZING)
                } else if (this._gazeState === GazeState.GAZING) {
                    if (Date.now() - this._gazeStartTime >= this.activationDelay) {
                        this._changeState(GazeState.ACTIVATED)
                    }
                }
            } else {
                if (this._gazeState !== GazeState.IDLE) {
                    this._changeState(GazeState.IDLE)
                }
            }
        })
    }

    /**
     * Détache le behavior du nœud auquel il est attaché.
     */
    public detach(): void {
        if (this._scene && this._renderObserver) {
            this._scene.onBeforeRenderObservable.remove(this._renderObserver)
            this._renderObserver = null
        }
        this._attachedNode = null
        this._scene = null
    }

    /**
     * Change l'état du behavior et déclenche les callbacks appropriés.
     * @param newState
     * @private
     */
    private _changeState(newState: GazeState): void {
        if (this._gazeState === newState) return

        const oldState = this._gazeState
        this._gazeState = newState
        if (newState === GazeState.GAZING) {
            this._gazeStartTime = Date.now()
            this.onGazeStart()
        } else if (newState === GazeState.ACTIVATED) {
            this.onGazeActivated()
        } else if (newState === GazeState.IDLE) {
            if (oldState === GazeState.GAZING || oldState === GazeState.ACTIVATED) {
                this.onGazeStop()
            }
            this._gazeStartTime = 0
        }
    }

    /**
     * Effectue un raycast depuis la caméra pour vérifier si l'utilisateur regarde le nœud attaché.
     * @private
     */
    private _performCheck(): void {
        this._lastCheckTime = Date.now()

        if (!this._attachedNode || !this._scene) {
            this._isCurrentlyGazing = false
            return
        }

        const gaze = this._inputs.head
        this._isCurrentlyGazing = gaze.targetMesh === this._attachedNode

        if (GazeBehavior.DEBUG_LOG) console.log("PICKED MESH:", gaze.targetMesh?.name)
    }

}
