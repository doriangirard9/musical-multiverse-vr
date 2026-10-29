import { buildHash, parseHash } from "../../../router/routes";
import { getPlatformChoices, PLATFORMS, PlatformChoice } from "./platforms";

/**
 * The route parameter holding the chosen platform. It lives in the route, next to the session, so
 * it is forgotten as soon as the user leaves the session.
 */
const ROUTE_PARAM = "platform"

/**
 * Lets the user choose the platform to run on, among the ones this device supports. Resolves with
 * the chosen platform, which is not initialized yet, and writes it in the url. The menu is skipped
 * when only one platform is supported, or when the url already names a supported one.
 */
export async function choosePlatform(): Promise<PlatformChoice> {
    const choices = await getPlatformChoices()
    if (choices.length === 0) return remember(PLATFORMS[0])
    if (choices.length === 1) return remember(choices[0])

    const fromRoute = parseHash(window.location.hash).params[ROUTE_PARAM]
    const known = choices.find(choice => choice.id === fromRoute)
    if (known) return known

    return remember(await showMenu(choices))
}

/**
 * Writes the platform in the route, without reloading or adding a history entry. Done with
 * replaceState rather than through the router, so its listeners do not see a route change and
 * reopen the session.
 */
function remember(choice: PlatformChoice): PlatformChoice {
    const { path, params } = parseHash(window.location.hash)
    const hash = buildHash(path, { ...params, [ROUTE_PARAM]: choice.id })
    window.history.replaceState(window.history.state, "", hash)
    return choice
}

function showMenu(choices: PlatformChoice[]): Promise<PlatformChoice> {
    return new Promise(resolve => {
        const overlay = document.createElement("div")
        overlay.className = "wj-platform-menu"

        const card = document.createElement("div")
        card.className = "wj-card wj-platform-menu-card"
        overlay.appendChild(card)

        const title = document.createElement("h1")
        title.className = "wj-title"
        title.textContent = "Choose your platform"
        card.appendChild(title)

        const subtitle = document.createElement("p")
        subtitle.className = "wj-subtitle"
        subtitle.textContent = "How do you want to enter the musical multiverse?"
        card.appendChild(subtitle)

        const list = document.createElement("div")
        list.className = "wj-platform-menu-list"
        card.appendChild(list)

        for (const choice of choices) {
            const button = document.createElement("button")
            button.type = "button"
            button.className = "wj-platform-menu-choice"

            const icon = document.createElement("span")
            icon.className = "wj-platform-menu-icon"
            icon.innerHTML = choice.icon
            icon.querySelector("svg")?.setAttribute("aria-hidden", "true")
            button.appendChild(icon)

            const name = document.createElement("span")
            name.className = "wj-platform-menu-name"
            name.textContent = choice.name
            button.appendChild(name)

            const description = document.createElement("span")
            description.className = "wj-platform-menu-description"
            description.textContent = choice.description
            button.appendChild(description)

            button.addEventListener("click", () => {
                overlay.remove()
                resolve(choice)
            }, { once: true })

            list.appendChild(button)
        }

        document.body.appendChild(overlay)
        list.querySelector("button")?.focus()
    })
}
