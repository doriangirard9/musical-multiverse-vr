import { Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { Pedal3D, Pedal3DConnectable, Pedal3DInput } from "./Pedal3D";
import { controls, WamGUIGenerator, WAMGuiInitCode } from "wam3dgenerator";


/**
 * A 3D Pedal based on the Wam3DGenerator GUI.
 */
export class WamGUI3DPedal implements Pedal3D{

    private constructor(
        private wam_gui_generator: WamGUIGenerator,
        readonly inputs: Pedal3DConnectable[],
        readonly outputs: Pedal3DConnectable[],
        readonly parameters: Pedal3DInput[],
        readonly mesh: TransformNode,
        readonly bounds: Vector3
    ){}

    static async create(wam_gui_generator: WAMGuiInitCode, scene: Scene, audioCtx: BaseAudioContext, groupid: string): Promise<WamGUI3DPedal>{
        const transform = new TransformNode("root", scene)

        const wam_generator = await WamGUIGenerator.create_and_init(
            {
                init_field(){},
                init_input(){},
                init_output(){},
                on_field_change(){},
            },
            {babylonjs:transform as any},
            wam_gui_generator, controls, audioCtx, groupid
        )

        const bounds = new Vector3(
            wam_generator.pad_mesh!!.scaling.x+.05,
            .15,
            wam_generator.pad_mesh!!.scaling.z+.05
        )

        return new WamGUI3DPedal(
            wam_generator,
            [],
            [],
            [],
            transform,
            bounds as any
        )
    }
}