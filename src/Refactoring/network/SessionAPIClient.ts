import { ApiClient } from '../auth/ApiClient.ts';

export interface JoinResponse {
    participantId: string;
    participantNumber: number;
    sessionName: string;
    maxUsers: number;
    crdtData?: string;
}

/**
 * API client dedicated to session interactions (join, leave, heartbeat, save).
 */
export class SessionAPIClient {
    constructor(private readonly api: ApiClient) {}

    async joinSession(sessionId: string, shareToken?: string): Promise<JoinResponse> {
        const body = shareToken ? { shareToken } : undefined;
        return this.api.request<JoinResponse>('POST', `/sessions/${sessionId}/join`, body);
    }

    async leaveSession(sessionId: string, participantId: string): Promise<void> {
        await this.api.request('POST', `/sessions/${sessionId}/leave`, { participantId });
    }

    async heartbeat(sessionId: string, participantId: string): Promise<{ participantCount: number }> {
        return this.api.request<{ participantCount: number }>('POST', `/sessions/${sessionId}/heartbeat`, { participantId });
    }

    async saveCRDT(sessionId: string, participantId: string, crdtData: string): Promise<void> {
        await this.api.request('POST', `/sessions/${sessionId}/save`, { participantId, crdtData });
    }

    async getParticipantCount(sessionId: string): Promise<number> {
        const res = await this.api.request<{ participantCount: number }>('GET', `/sessions/${sessionId}/participants`);
        return res.participantCount;
    }
}
