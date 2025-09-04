export interface MenuConfig {
    categories: {
        name: string;
        plugins: {
            name: string,
            kind: string
        }[];
    }[];
}

export interface Position3D {
    x: number;
    y: number;
    z: number;
}

export interface NodeTransform {
    position: Position3D;
    rotation: Position3D;
}

