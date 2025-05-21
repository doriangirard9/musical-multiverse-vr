import {BaseEventBus} from "./BaseEventBus.ts";
import {IAudioNodeConfig} from "../shared/SharedTypes.ts";

export type MenuEventType = {
    OPEN_MENU : "OPEN_MENU";
    CLOSE_MENU : "CLOSE_MENU";
    CREATE_AUDIO_NODE : "CREATE_AUDIO_NODE";
    CREATE_AUDIO_OUTPUT : "CREATE_AUDIO_OUTPUT";

    MAIN_MENU_DISABLE: "MAIN_MENU_DISABLE";
    MAIN_MENU_ENABLE: "MAIN_MENU_ENABLE";

};

export type MenuEventPayload = {
    OPEN_MENU : {
        menuId : string;
    };
    CLOSE_MENU : {
        menuId : string;
    };
    CREATE_AUDIO_NODE : {
        nodeId : string;
        name : string;
        configFile? : string;
    };
    CREATE_AUDIO_OUTPUT : {
        nodeId : string;
        name : string;
    };
    MAIN_MENU_DISABLE: {
        disable: boolean;
    };
    MAIN_MENU_ENABLE: {
        enable: boolean;
    };
};

export class MenuEventBus extends BaseEventBus<MenuEventPayload> {
    private static instance: MenuEventBus;

    private constructor() {
        super();
    }

    public static getInstance(): MenuEventBus {
        if (!MenuEventBus.instance) {
            MenuEventBus.instance = new MenuEventBus();
        }
        return MenuEventBus.instance;
    }
}