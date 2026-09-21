import { Color3, StandardMaterial } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { tools } from "../../../xr/inputs"
import { MenuSystem } from "../../../app/menu/MenuSystem"
import THUMBNAIL_URL from "./thumbnail.png?url"

/** The green of the ray, so a hand lent to a menu does not look like a hand holding a tool. */
const RAY_COLOR = new Color3(0.4, 1, 0.4)

/**
 * The hand lent to a menu: a green ray that reaches the open menu and nothing else.
 *
 * @remarks
 * It is what a hand holds while it stands in front of a menu, so that any tool, even one with no
 * pointer of its own, leaves the user able to choose in the menu he just opened, and unable to
 * disturb the world behind it.
 */
export class MenuPointerTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context
        this.#visual = tools.InputVisualPointer.CreateSimple(context.scene, context.controller.pointer)

        context.interactions.pointer.enable()

        const material = new StandardMaterial("menu pointer ray", context.scene)
        material.diffuseColor = Color3.Black()
        material.emissiveColor = RAY_COLOR
        material.disableLighting = true
        this.#material = material

        this.#visual.line.material = material
        this.#visual.point.material = material
        this.#visual.contactPoint.material = material

        context.pickFilters.add(mesh => {
            const menu = MenuSystem.getInstance().current_menu
            return menu !== undefined && mesh.isDescendantOf(menu.root)
        })
    }

    public dispose(): void {
        this.#context.interactions.pointer.disable()
        this.#visual.remove()
        this.#material.dispose()
    }

    readonly #context: ToolContext

    readonly #visual: ReturnType<typeof tools.InputVisualPointer.CreateSimple>

    readonly #material: StandardMaterial

}

/** The kind of the hand lent to a menu, never offered in the catalog. */
export const MENU_POINTER_TOOL_KIND: ToolKind = {
    label: "Menu pointer",
    description: "The hand lent to a menu: its ray reaches the open menu, and nothing else.",
    thumbnail: THUMBNAIL_URL,
    tags: ["tool", "distance"],
    create: context => new MenuPointerTool(context),
}
