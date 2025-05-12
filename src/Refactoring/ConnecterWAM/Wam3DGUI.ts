import {TubeParams} from "../shared/SharedTypes.ts";
import {
    ActionManager,
    Color3,
    ExecuteCodeAction,
    HighlightLayer,
    Mesh,
    MeshBuilder,
    Nullable, PointerInfo,
    StandardMaterial,
    Vector3
} from "@babylonjs/core";
import {Wam3D} from "./Wam3D.ts";
import {PortType} from "./interfaces/EnumConnexionType.ts";
import {IWamPort} from "./interfaces/IWamPort.ts";
import {SceneManager} from "../app/SceneManager.ts";
import {IOEventBus} from "../eventBus/IOEventBus.ts";

export class Wam3DGUI {
    public inputArcs: TubeParams[];
    public outputArcs: TubeParams[];

    public inputOutputMeshs: Nullable<Map<string, Mesh>>;


    public inputMeshHitBox: Nullable<Mesh[]>;
    public outputMeshHitBox: Nullable<Mesh[]>;

    private scene = SceneManager.getInstance().getScene();

    private static audioInMaterial: Nullable<StandardMaterial> = null;
    private static audioOutMaterial: Nullable<StandardMaterial> = null;
    private static midiInMaterial: Nullable<StandardMaterial> = null;
    private static midiOutMaterial: Nullable<StandardMaterial> = null;

    private isInitialized = false;
    private ioEventBus: IOEventBus = IOEventBus.getInstance();

    constructor(private readonly parent: Wam3D) {
        this.inputArcs = [];
        this.outputArcs = [];

        this.inputOutputMeshs = new Map<string, Mesh>();
        this.inputMeshHitBox = null;
        this.outputMeshHitBox = null;

        if (!Wam3DGUI.audioInMaterial) {
            Wam3DGUI.audioInMaterial = new StandardMaterial("audioInMaterial", this.scene);
            Wam3DGUI.audioInMaterial.diffuseColor = new Color3(0, 1, 0);
        }

        if (!Wam3DGUI.midiInMaterial) {
            Wam3DGUI.midiInMaterial = new StandardMaterial("midiInMaterial", this.scene);
            Wam3DGUI.midiInMaterial.diffuseColor = new Color3(0.5, 0, 0.5);
        }

        if (!Wam3DGUI.audioOutMaterial) {
            Wam3DGUI.audioOutMaterial = new StandardMaterial("audioOutMaterial", this.scene);
            Wam3DGUI.audioOutMaterial.diffuseColor = new Color3(1, 0, 0);
        }

        if (!Wam3DGUI.midiOutMaterial) {
            Wam3DGUI.midiOutMaterial = new StandardMaterial("midiOutMaterial", this.scene);
            Wam3DGUI.midiOutMaterial.diffuseColor = new Color3(0, 0, 1);
        }
    }

    public initialize(): void {
        if (this.isInitialized) return

        this.processPorts();
        this.isInitialized = true;
    }


    private processPorts(): void {
        const inputPorts: IWamPort[] = [];
        const outputPorts: IWamPort[] = [];

        this.parent.getPorts().forEach(p => {
            console.log("This Wam has : " + p.id + " port of type " + p.type);
            if (p.type === PortType.AUDIO_INPUT || p.type === PortType.MIDI_INPUT) {
                inputPorts.push(p);
            } else if (p.type === PortType.AUDIO_OUTPUT || p.type === PortType.MIDI_OUTPUT) {
                outputPorts.push(p);
            }
        });


        const boundingInfo = this.parent.baseMesh.getBoundingInfo();
        const width = boundingInfo.boundingBox.extendSize.x * 2;


        this.createPorts(inputPorts, -width / 2, true);
        this.createPorts(outputPorts, width / 2, false);
    }

    private createPorts(ports: IWamPort[], xPosition: number, isInput: boolean): void {
        console.log(ports);

        // Espacer verticalement si plusieurs ports
        const spacing = 0.5;
        const totalHeight = (ports.length - 1) * spacing;

        ports.forEach((port, index) => {
            // Position Y pour espacer verticalement
            const yPosition = -totalHeight / 2 + index * spacing;

            // Nommer en fonction du type de port
            const prefix = isInput ? "input" : "output";
            const meshName = `${prefix}Mesh_${port.id}_${this.parent.id}`;
            const hitBoxName = `${prefix}HitBox_${port.id}_${this.parent.id}`;

            // Créer les meshes
            const portMesh = MeshBuilder.CreateSphere(meshName, {diameter: 0.5}, this.scene);
            portMesh.isPickable = false;
            const hitBox = MeshBuilder.CreateSphere(hitBoxName, {diameter: 1}, this.scene);

            if (port.id == "audioIn"){
                this.inputOutputMeshs?.set(port.id, portMesh)
            }
            if (port.id == "audioOut"){
                this.inputOutputMeshs?.set(port.id, portMesh)
            }
            if (port.id == "midiIn"){
                this.inputOutputMeshs?.set(port.id, portMesh)
            }
            if (port.id == "midiOut"){
                this.inputOutputMeshs?.set(port.id, portMesh)
            }

            // Configuration du mesh
            hitBox.parent = portMesh;
            hitBox.visibility = 0;
            portMesh.parent = this.parent.baseMesh;
            portMesh.position = new Vector3(xPosition, yPosition, 0);

            // Appliquer le matériau selon le type de port
            switch (port.id) {
                case 'audioIn':
                    portMesh.material = Wam3DGUI.audioInMaterial;
                    break;
                case 'audioOut':
                    portMesh.material = Wam3DGUI.audioOutMaterial;
                    break;
                case 'midiIn':
                    portMesh.material = Wam3DGUI.midiInMaterial;
                    break;
                case 'midiOut':
                    portMesh.material = Wam3DGUI.midiOutMaterial;
                    break;
            }

            const highlightColor = isInput ? Color3.Green() : Color3.Red(); // trouver une couleur qui rend mieux que rouge
            const highlightLayer = new HighlightLayer(`hl-${prefix}-${this.parent.id}`, this.scene);

            hitBox.actionManager = new ActionManager(this.scene);
            hitBox.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, (): void => {
                highlightLayer.addMesh(portMesh as Mesh, highlightColor);
            }));
            hitBox.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, (): void => {
                highlightLayer.removeMesh(portMesh as Mesh);
            }));

            hitBox.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickDownTrigger, (event): void => {
                console.log(`pick down - on clique sur ${isInput ? "l'entrée" : "la sortie"} pour créer un tube`);
                this.ioEventBus.emit('IO_CONNECT', {
                    type: port.type,
                    pickType: 'down',
                    node: this.parent,
                    portId: port.id,
                    isInput: isInput,
                });
            }));
            hitBox.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickUpTrigger, (): void => {
                console.log(`pick up - on relache le bouton sur ${isInput ? "une entrée" : "une sortie"}`);
                this.ioEventBus.emit('IO_CONNECT', {
                    type: port.type,
                    pickType: 'up',
                    node: this.parent,
                    portId: port.id,
                    isInput: isInput,
                });
            }));
            hitBox.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickOutTrigger, (): void => {
                console.log(`pick out - on relache sur ${isInput ? "une sortie" : "une entrée"} ou dans le vide`);
                this.ioEventBus.emit('IO_CONNECT', {
                    type: port.type,
                    pickType: 'out',
                    node: this.parent,
                    portId: port.id,
                    isInput: isInput,
                });
            }));

        });
    }
}