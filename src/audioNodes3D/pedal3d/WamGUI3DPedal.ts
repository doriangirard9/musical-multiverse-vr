import { Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { Pedal3D, Pedal3DConnectable, Pedal3DInput } from "./Pedal3D";
import { controls, WamGUIGenerator, WAMGuiInitCode } from "wam3dgenerator";


/**
 * A 3D Pedal based on the Wam3DGenerator GUI.
 */
export class WamGUI3DPedal implements Pedal3D{

    private constructor(
        readonly wam_gui_generator: WamGUIGenerator,
        readonly inputs: Pedal3DConnectable[],
        readonly outputs: Pedal3DConnectable[],
        readonly parameters: Pedal3DInput[],
        readonly mesh: TransformNode,
        readonly bounds: Vector3
    ){}

    static async create(wam_gui_generator: WAMGuiInitCode, scene: Scene, audioCtx: BaseAudioContext, groupid: string): Promise<WamGUI3DPedal>{
        const transform = new TransformNode("root", scene)

        const inputs: Pedal3DConnectable[] = []

        const outputs: Pedal3DConnectable[] = []

        const wam_generator = await WamGUIGenerator.create_and_init(
            {
                defineAnInput(settings) {
                    inputs.push({
                        mesh: settings.target,
                        audioNode: settings.node,
                        setConnect(isConnected) {
                            settings.setConnected(isConnected)
                        }
                    })
                },
                defineAnOutput(settings) {
                    outputs.push({
                        mesh: settings.target,
                        audioNode: settings.node,
                        setConnect(isConnected) {
                            settings.setConnected(isConnected)
                        }
                    })
                },
                defineField(settings) {
                    
                },
                onFieldChange(label, value) {
                    
                },
            },
            {babylonjs:transform as any},
            wam_gui_generator, controls, audioCtx, groupid
        )

        const bounds = new Vector3(
            wam_generator.pad_mesh!!.scaling.x+.05,
            .15,
            wam_generator.pad_mesh!!.scaling.z+.05
        )

        return new WamGUI3DPedal(wam_generator, inputs, outputs,
            [],
            transform,
            bounds
        )
    }
}