import {SceneManager} from "../app/SceneManager";
import {UIEventPayload} from "../eventBus/UIEventBus";
import {
    AbstractMesh,
    Axis, EventState,
    Mesh,
    MeshBuilder,
    Nullable, Observer, Plane, PointerDragBehavior, PointerEventTypes, PointerInfo, Ray,
    Scene,
    Space, TransformNode,
    Vector3
} from "@babylonjs/core";


interface ActiveConnectionVisual {
    id: string;
    tubeMesh: Mesh;
    arrowMesh: Mesh;
    outputMesh: AbstractMesh;
    outputNodeId: string;
    inputMesh: AbstractMesh;
    inputNodeId: string;
}

export class ConnectionManager {
    private static instance: ConnectionManager;
    private scene: Scene;

    private previewStartMesh: Nullable<AbstractMesh> = null;
    private previewDragPoint: Nullable<TransformNode> = null;
    private previewPointerDragBehavior: Nullable<PointerDragBehavior> = null;
    private previewTube: Nullable<Mesh> = null;
    private previewArrow: Nullable<Mesh> = null;
    private _onDragEndObserver: Nullable<Observer<any>> = null; // Pour stocker l'observateur de onDragEnd
    private _previewPointerMoveObserver : Nullable<Observer<PointerInfo>> = null; // Pour stocker l'observateur de pointerMove
    // --- Persistent Connections  ---
    private activeConnections: Map<string, ActiveConnectionVisual> = new Map();

    private constructor() {
        try {
            this.scene = SceneManager.getInstance().getScene();
        } catch (error) {
            console.error("ConnectionManager: Failed to get scene instance. Ensure SceneManager is initialized.", error);
            throw new Error("Scene not available for ConnectionManager");
        }
    }

    public static getInstance(): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }

    // --- Preview Methods ---

    /**
     * Starts the visual preview for a connection attempt.
     * Creates temporary tube, arrow, and drag point.
     * @param startNode The WAM node where the connection starts.
     * @param portId The ID of the port on the startNode.
     */
    public startConnectionPreview(id:string, startMesh: AbstractMesh, portId: string): void {
        console.log(`[Desktop Check] startConnectionPreview: node ${id}, port ${portId}`);
        const portMesh = startMesh;
        if (!portMesh) {
            console.error(`[*] ConnectionManager - Preview: Port mesh not found for node ${id}, portId: ${portId}`);
            return;
        }

        this.cancelConnectionPreview(); // Nettoie toute prévisualisation précédente

        this.previewStartMesh = portMesh;
        const startPos = this.previewStartMesh.getAbsolutePosition(); // ESSENTIEL: cette position doit être correcte
        console.log(`[Desktop Check] Preview Start Position: ${startPos.toString()}`);
        if (startPos.equals(Vector3.Zero())) {
            console.warn(`[*] ConnectionManager - Preview: Start mesh ${portMesh.name} for node ${id} is at world origin. This WILL cause issues if not intended.`);
        }

        const initialEndPos = startPos.clone(); // Pour la position initiale du tube
        const arrowLength = 0.7;
        // const sphereRadius = 0.25; // sphereRadius est utilisé dans l'update, pas pour le path initial du tube

        // Path initial du tube (très court, juste pour exister)
        const path = [startPos, initialEndPos.add(new Vector3(0.01, 0, 0))]; // Légèrement décalé pour éviter un tube de longueur nulle

        this.previewTube = MeshBuilder.CreateTube("previewTube", {
            path: path,
            radius: 0.1,
            tessellation: 4,
            updatable: true,
        }, this.scene);
        this.previewTube.isPickable = false;

        this.previewArrow = MeshBuilder.CreateCylinder("previewArrow", {
            height: arrowLength,
            diameterTop: 0,
            diameterBottom: 0.5,
            tessellation: 4
        }, this.scene);
        this.previewArrow.position = initialEndPos.clone(); // Sera mis à jour
        this.previewArrow.isPickable = false;

        // Écouter les mouvements du pointeur sur la scène
        this._previewPointerMoveObserver = this.scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
            if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
                if (!this.previewTube || !this.previewArrow || !this.previewStartMesh || !this.scene.activeCamera) {
                    // console.warn("[Desktop Check] POINTERMOVE: Missing components, skipping update.");
                    return;
                }

                const currentStartPos = this.previewStartMesh.getAbsolutePosition();
                let targetEndPos: Nullable<Vector3> = null;
                let pointerRay: Nullable<Ray> = null;


                pointerRay = pointerInfo.pickInfo?.ray ?? null;

                if (!pointerRay || pointerRay.direction.lengthSquared() < 0.00001) {
                    pointerRay = pointerInfo.pickInfo?.ray ?? null;
                }

                // Pour le desktop, ce fallback est crucial si les précédents échouent ou pour l'appel initial.
                if (!pointerRay || pointerRay.direction.lengthSquared() < 0.00001) {
                    // console.log("[Desktop Check] POINTERMOVE: Attempting fallback createPickingRay");
                    if (this.scene.activeCamera && this.scene.pointerX !== undefined && this.scene.pointerY !== undefined) {
                        // console.log(`[Desktop Check] POINTERMOVE: Creating ray from pointerX: ${this.scene.pointerX}, pointerY: ${this.scene.pointerY}`);
                        pointerRay = this.scene.createPickingRay(
                            this.scene.pointerX,
                            this.scene.pointerY,
                            null,
                            this.scene.activeCamera
                        );
                    } else {
                        // console.warn("[Desktop Check] POINTERMOVE: Fallback failed - no activeCamera or pointerX/Y undefined.");
                    }
                }

                if (!pointerRay || pointerRay.direction.lengthSquared() < 0.00001) {
                    // console.warn("[Desktop Check] POINTERMOVE: Still no valid pointerRay. Tube will not update.");
                    return;
                }
                // console.log(`[Desktop Check] POINTERMOVE: Ray origin: ${pointerRay.origin.toString()}, direction: ${pointerRay.direction.toString()}`);


                // Définition du plan de drag
                let dragPlane: Plane;
                const camForward = this.scene.activeCamera.getForwardRay().direction;

                // Pour le desktop, on peut utiliser un plan à une distance fixe de la caméra,
                // ou un plan passant par le point de départ et face à la caméra.
                // Testons avec un plan face caméra passant par currentStartPos.
                // Si currentStartPos est (0,0,0), ce plan passera par l'origine.
                dragPlane = Plane.FromPositionAndNormal(currentStartPos, camForward);
                // Alternative: un plan à une distance fixe de la caméra, normal à sa direction
                // const planeDistance = 10; // distance devant la caméra
                // dragPlane = new Plane(camForward.x, camForward.y, camForward.z, -this.scene.activeCamera.globalPosition.subtract(camForward.scale(planeDistance)).length());
                // Ou le plan XY original qui peut causer des soucis si la caméra regarde vers le bas.
                // dragPlane = new Plane(0, 0, 1, -currentStartPos.z); // -Z du point de départ

                // console.log(`[Desktop Check] POINTERMOVE: DragPlane defined: normal=${dragPlane.normal.toString()}, d=${dragPlane.d}`);

                const distance = pointerRay.intersectsPlane(dragPlane);
                // console.log(`[Desktop Check] POINTERMOVE: Ray intersection distance with plane: ${distance}`);


                if (distance !== null && distance > 0) {
                    targetEndPos = pointerRay.origin.add(pointerRay.direction.scale(distance));
                } else {
                    // Fallback si pas d'intersection (ex: rayon parallèle au plan)
                    // console.warn("[Desktop Check] POINTERMOVE: Ray did not intersect dragPlane or distance <= 0. Using fixed projection.");
                    targetEndPos = pointerRay.origin.add(pointerRay.direction.scale(10)); // Projeter à 10 unités devant le rayon
                }

                if (targetEndPos) {
                    // console.log(`[Desktop Check] POINTERMOVE: currentStartPos=${currentStartPos.toString()}, targetEndPos=${targetEndPos.toString()}`);
                    if (currentStartPos.equals(Vector3.Zero()) && targetEndPos.equals(Vector3.Zero())) {
                        console.warn("[*] ConnectionManager - Preview Update: Tube path is from (0,0,0) to (0,0,0).");
                    }

                    const tubePath = [currentStartPos, targetEndPos];
                    MeshBuilder.CreateTube("previewTube", {
                        path: tubePath,
                        instance: this.previewTube, // Mise à jour de l'instance
                        radius: 0.1, // Assurez-vous que les autres params sont là aussi si CreateTube les attend pour 'instance'
                        tessellation: 4,
                        updatable: true
                    }, this.scene);

                    const sphereRadiusConst = 0.25; // Définir les constantes utilisées ici
                    const arrowLengthConst = 0.7;
                    const dragDirection = targetEndPos.subtract(currentStartPos);
                    const length = dragDirection.length();

                    if (length > 0.001) {
                        dragDirection.normalize();
                        this.previewArrow.position = targetEndPos.subtract(dragDirection.scale((sphereRadiusConst + arrowLengthConst / 2)));
                        this.previewArrow.lookAt(targetEndPos);
                        this.previewArrow.rotate(Axis.X, Math.PI / 2, Space.LOCAL);
                    } else {
                        this.previewArrow.position = targetEndPos; // Cachez ou orientez par défaut si la longueur est trop petite
                    }
                } else {
                    // console.warn("[Desktop Check] POINTERMOVE: targetEndPos is null. Tube not updated.");
                }
            }
        });

        // Forcer une première mise à jour pour le desktop.
        // Cet appel est crucial pour voir le tube dès le début.
        // On simule un PointerInfo minimal. Le callback devrait tomber dans le fallback `createPickingRay`.
        // console.log("[Desktop Check] Forcing initial POINTERMOVE callback.");
        if (this.scene.pointerX !== undefined && this.scene.pointerY !== undefined && this.scene.activeCamera) {
            const fakeEvent = new PointerEvent("pointermove", {
                clientX: this.scene.pointerX,
                clientY: this.scene.pointerY
            });
            const simulatedPointerInfo = {
                type: PointerEventTypes.POINTERMOVE,
                event: fakeEvent,
                pickInfo: null,
                // @ts-ignore
                ray: null, // Assurez-vous que le callback gère bien ray étant null ici
            } as unknown as PointerInfo;

            this._previewPointerMoveObserver?.callback(simulatedPointerInfo, new EventState(0));
            // console.log("[Desktop Check] Initial POINTERMOVE callback executed.");
        } else {
            console.warn("[Desktop Check] Cannot force initial POINTERMOVE: scene.pointerX/Y or activeCamera undefined.");
        }
    }
    public cancelConnectionPreview(): void {
        // console.log("[CM Preview] Cancelling connection preview.");

        if (this.previewPointerDragBehavior) {
            if (this._onDragEndObserver) {
                this.previewPointerDragBehavior.onDragEndObservable.remove(this._onDragEndObserver);
                this._onDragEndObserver = null;
            }
            // Detach from observables (onDragObservable is cleared when behavior is removed or node disposed)
            this.previewPointerDragBehavior.onDragObservable.clear();
            if (this.previewDragPoint && !this.previewDragPoint.isDisposed()) {
                try {
                    this.previewDragPoint.removeBehavior(this.previewPointerDragBehavior);
                } catch(e) {
                    console.warn("[CM Preview] Error removing PDB: ", e)
                }
            }
            // No need to dispose PDB itself, it's a behavior.
            this.previewPointerDragBehavior = null;
        }

        if (this.previewArrow && !this.previewArrow.isDisposed()) {
            this.previewArrow.dispose();
            this.previewArrow = null;
        }

        if (this.previewTube && !this.previewTube.isDisposed()) {
            this.previewTube.dispose();
            this.previewTube = null;
        }

        if (this.previewDragPoint && !this.previewDragPoint.isDisposed()) {
            this.previewDragPoint.dispose();
            this.previewDragPoint = null;
        }

        this.previewStartMesh = null;
        // console.log("[CM Preview] Preview visuals cleaned up.");
    }

    // --- Persistent Connection Methods ---

    /**
     * Creates the persistent visual representation (tube and arrow) for a successful connection.
     * @param connectionId A unique identifier for this connection visual.
     * @param outputPortMesh The source port mesh where the connection starts.
     * @param outputNodeId The ID of the source Wam3D node.
     * @param inputPortMesh The target port mesh where the connection ends.
     * @param inputNodeId The ID of the target Wam3D node.
     */
    public createConnectionArc(
        connectionId: string,
        outputPortMesh: AbstractMesh,
        outputNodeId: string,
        inputPortMesh: AbstractMesh,
        inputNodeId: string
    ): void {
        if (!outputPortMesh || !inputPortMesh) {
            console.error(`[*] ConnectionManager - Arc: Cannot create arc due to missing port meshes. ID: ${connectionId}`);
            return;
        }
        if (this.activeConnections.has(connectionId)) {
            console.warn(`[*] ConnectionManager - Arc: Visual connection with ID ${connectionId} already exists.`);
            return;
        }

        const startPos = outputPortMesh.getAbsolutePosition();
        const endPos = inputPortMesh.getAbsolutePosition();

        console.log(`[*] ConnectionManager - Arc: Creating persistent visual: ${connectionId}`);

        const arrowLength = 0.7;
        const sphereRadius = 0.25;
        const direction = endPos.subtract(startPos).normalize();
        if (direction.lengthSquared() < 0.001) { direction.set(0,0,1); }

        const adjustedEndPos = endPos.subtract(direction.scale((sphereRadius + arrowLength / 2)));
        const path = [startPos, adjustedEndPos];

        const tube = MeshBuilder.CreateTube(`tube_${connectionId}`, {
            path: path,
            radius: 0.1,
            tessellation: 4,
            updatable: true
        }, this.scene);
        // tube.isPickable = true; // Pour faire une action delete quand on clique sur le tube
        // tube.actionManager = xxx

        const arrow = MeshBuilder.CreateCylinder(`arrow_${connectionId}`, {
            height: arrowLength,
            diameterTop: 0,
            diameterBottom: 0.5,
            tessellation: 4
        }, this.scene);
        arrow.position = adjustedEndPos;
        arrow.parent = tube;
        arrow.isPickable = false;
        arrow.lookAt(endPos);
        arrow.rotate(Axis.X, Math.PI / 2, Space.LOCAL);

        this.activeConnections.set(connectionId, {
            id: connectionId,
            tubeMesh: tube,
            arrowMesh: arrow,
            outputMesh: outputPortMesh,
            outputNodeId: outputNodeId,
            inputMesh: inputPortMesh,
            inputNodeId: inputNodeId
        });
    }

    /**
     * Updates the visual representation of connections when a node moves.
     * @param event Payload containing the ID and new transform of the moved node.
     */
    public handleNodeUpdate(event: UIEventPayload['WAM_POSITION_CHANGE']): void {
        if (!event || !event.nodeId) return;
        const movedNodeId = event.nodeId;

        this.activeConnections.forEach(conn => {
            let needsUpdate = false;
            let currentStartPos = conn.outputMesh.getAbsolutePosition();
            let currentEndPos = conn.inputMesh.getAbsolutePosition();

            if (conn.outputNodeId === movedNodeId) {
                needsUpdate = true;
            }
            if (conn.inputNodeId === movedNodeId) {
                needsUpdate = true;
            }

            if (needsUpdate) {
                const startPos = currentStartPos;
                const endPos = currentEndPos;
                const arrowLength = 0.7;
                const sphereRadius = 0.25;
                const direction = endPos.subtract(startPos).normalize();
                if (direction.lengthSquared() < 0.001) { direction.set(0,0,1); } // Avoid NaN

                const adjustedEndPos = endPos.subtract(direction.scale((sphereRadius + arrowLength / 2)));
                const newPath = [startPos, adjustedEndPos];

                MeshBuilder.CreateTube(conn.tubeMesh.name, { path: newPath, instance: conn.tubeMesh }, this.scene);

                conn.arrowMesh.position = adjustedEndPos;
                conn.arrowMesh.lookAt(endPos);
                conn.arrowMesh.rotate(Axis.X, Math.PI / 2, Space.LOCAL);
            }
        });
    }

    /**
     * Deletes the visual representation of a specific connection.
     * Does NOT handle the internal audio/MIDI disconnection.
     * @param connectionId The unique ID of the connection visual to delete.
     */
    public deleteConnectionArcById(connectionId: string): void {
        const conn = this.activeConnections.get(connectionId);
        if (conn) {
            console.log(`[*] ConnectionManager - Arc: Deleting visual: ${connectionId}`);
            if (conn.arrowMesh && !conn.arrowMesh.isDisposed()) {
                conn.arrowMesh.dispose();
            }
            if (conn.tubeMesh && !conn.tubeMesh.isDisposed()) {
                conn.tubeMesh.dispose();
            }
            this.activeConnections.delete(connectionId);
        } else {
            console.warn(`[*] ConnectionManager - Arc: Cannot delete visual for non-existent ID: ${connectionId}`);
        }
    }

    /**
     * Deletes all visual connection arcs associated with a given node ID.
     * Does NOT handle the internal audio/MIDI disconnection.
     * @param nodeId The ID of the node whose connections should be visually removed.
     */
    public deleteArcsForNode(nodeId: string): void {
        console.log(`[*] ConnectionManager - Arc: Deleting all visuals connected to node: ${nodeId}`);
        const idsToDelete: string[] = [];
        this.activeConnections.forEach((conn, id) => {
            if (conn.outputNodeId === nodeId || conn.inputNodeId === nodeId) {
                idsToDelete.push(id);
            }
        });

        if (idsToDelete.length > 0) {
            console.log(`   Found ${idsToDelete.length} visuals to delete for node ${nodeId}`);
            idsToDelete.forEach(id => this.deleteConnectionArcById(id));
        } else {
            console.log(`   No visuals found for node ${nodeId}`);
        }
    }
}