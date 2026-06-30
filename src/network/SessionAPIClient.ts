import { ApiClient } from '../auth/ApiClient.ts';

export interface JoinResponse {
    participantId: string;
    participantNumber: number;
    sessionName: string;
    maxUsers: number;
    crdtData?: string;
    sessionLocked?: boolean;
    /** Session 100% non persistante (éphémère) → le client ne sauvegarde pas. */
    isTemporary?: boolean;
}

export interface SessionSummary {
    id: string;
    name: string;
    is_public?: number;
    max_users?: number;
    share_token?: string;
    is_temporary?: number;
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

    /**
     * Crée une session TEMPORAIRE (100% non persistante, éphémère). Accessible
     * aux invités. Renvoie la session créée (id, share_token…).
     */
    async createTemporary(name?: string): Promise<{ session: SessionSummary }> {
        return this.api.request<{ session: SessionSummary }>('POST', `/sessions/temporary`, name ? { name } : {});
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
