export interface NetworkPlayer {
    id: string;
    position: {
        x: number;
        y: number;
        z: number;
    };
    direction: {
        x: number;
        y: number;
        z: number;
    };
    leftHandPosition: {
        x: number;
        y: number;
        z: number;
    };
    rightHandPosition: {
        x: number;
        y: number;
        z: number;
    };
}

export interface NetworkStepSequencer {
    id: string;
    position: {
        x: number;
        y: number;
        z: number;
    };
    isPlaying: boolean;
    grid: boolean[][];
    bpm: number;
}