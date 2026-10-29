import { SceneManager } from "../../SceneManager";
import { PCPlatform } from "../PCPlatform";
import { PhoneViewPlatform } from "../PhoneViewPlatform";
import { Platform } from "../Platform";
import { XRPlatform } from "../XRPlatform";

export interface PlatformChoice{
    checkSupport(): Promise<boolean>
    init(): Promise<Platform>
    /** The SVG markup of the icon, inlined so it takes the color of the text around it. */
    icon: string
    /** Identifies the platform in the url, so a reload keeps the choice. */
    id: string
    name: string
    description: string
}

export const PLATFORMS: PlatformChoice[] = [
    {
        id: "desktop",
        name: "Desktop",
        description: "Use your computer mouse and keyboard to simulate a VR experience.",
        icon: (await import("./desktop.svg?raw")).default,
        async checkSupport(): Promise<boolean> {
            return  !navigator.userAgent.includes("OculusBrowser")
            &&      window.matchMedia('(pointer: fine)').matches
        },
        async init(): Promise<Platform> {
            await PCPlatform.initialize()
            return PCPlatform.getInstance()
        },
    },
    {
        id: "xr",
        name: "XR",
        description: "Use a VR headset to enter the musical multiverse.",
        icon: (await import("./vr-headset.svg?raw")).default,
        async checkSupport(): Promise<boolean> {
            return await XRPlatform.hasXRSupport()
        },
        async init(): Promise<Platform> {
            await XRPlatform.initializeXR(SceneManager.getInstance().getScene())
            return XRPlatform.getInstance()
        },
    },
    {
        id: "ar",
        name: "AR",
        description: "Use an AR headset to enter the musical multiverse.",
        icon: (await import("./vr-headset-landscape.svg?raw")).default,
        async checkSupport(): Promise<boolean> {
            return await XRPlatform.hasARSupport()
        },
        async init(): Promise<Platform> {
            await XRPlatform.initializeAR(SceneManager.getInstance().getScene())
            return XRPlatform.getInstance()
        },
    },
    {
        id: "phone",
        name: "Phone View",
        description: "Use your phone to view the musical multiverse.",
        icon: (await import("./phone-spectator.svg?raw")).default,
        async checkSupport(): Promise<boolean> {
            return PhoneViewPlatform.isPhone()
        },
        async init(): Promise<Platform> {
            await PhoneViewPlatform.initialize()
            return PhoneViewPlatform.getInstance()
        },
    }
]

export async function getPlatformChoices(): Promise<PlatformChoice[]> {
    const filtered = await Promise.all(PLATFORMS.map(async (platform) => {
        const supported = await platform.checkSupport()
        return supported ? platform : null
    }))
    return filtered.filter((platform) => platform !== null) as PlatformChoice[]
}