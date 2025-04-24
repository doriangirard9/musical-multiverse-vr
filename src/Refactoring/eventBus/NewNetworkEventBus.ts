import { BaseEventBus } from './BaseEventBus';
import { Vector3, Quaternion } from '@babylonjs/core';
import { PlayerColor } from '../app/types/PlayerTypes';

/**
 * Network event types enum - defines all possible network events
 */
export enum NetworkEventType {
  // Player-related events
  PLAYER_JOINED = 'PLAYER_JOINED',
  PLAYER_LEFT = 'PLAYER_LEFT',
  PLAYER_MOVED = 'PLAYER_MOVED',
  PLAYER_ROTATED = 'PLAYER_ROTATED',
  PLAYER_COLOR_CHANGED = 'PLAYER_COLOR_CHANGED',
  PLAYER_NAME_CHANGED = 'PLAYER_NAME_CHANGED',
  
  // Connection events
  CONNECTION_ESTABLISHED = 'CONNECTION_ESTABLISHED',
  CONNECTION_LOST = 'CONNECTION_LOST',
  RECONNECTING = 'RECONNECTING',
  
  // Room events
  ROOM_JOINED = 'ROOM_JOINED',
  ROOM_LEFT = 'ROOM_LEFT',
  ROOM_CREATED = 'ROOM_CREATED',
  
  // Message events
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  MESSAGE_SENT = 'MESSAGE_SENT',
  
  // Audio node events
  NODE_CREATED = 'NODE_CREATED',
  NODE_DELETED = 'NODE_DELETED',
  NODE_MOVED = 'NODE_MOVED',
  NODE_ROTATED = 'NODE_ROTATED',
  NODE_PARAMETER_CHANGED = 'NODE_PARAMETER_CHANGED',
  
  // Error events
  NETWORK_ERROR = 'NETWORK_ERROR'
}

// Base interface for all network event payloads
export interface NetworkEventPayload {
  timestamp?: number;
  senderId?: string;
}

// Player event payloads
export interface PlayerJoinedPayload extends NetworkEventPayload {
  playerId: string;
  playerName: string;
  position?: Vector3;
  rotation?: Quaternion;
  color?: PlayerColor;
}

export interface PlayerLeftPayload extends NetworkEventPayload {
  playerId: string;
}

export interface PlayerMovedPayload extends NetworkEventPayload {
  playerId: string;
  position: Vector3;
}

export interface PlayerRotatedPayload extends NetworkEventPayload {
  playerId: string;
  rotation: Quaternion;
}

export interface PlayerColorChangedPayload extends NetworkEventPayload {
  playerId: string;
  color: PlayerColor;
}

export interface PlayerNameChangedPayload extends NetworkEventPayload {
  playerId: string;
  name: string;
}

// Connection event payloads
export interface ConnectionEstablishedPayload extends NetworkEventPayload {
  connectionId: string;
  serverInfo?: any;
}

export interface ConnectionLostPayload extends NetworkEventPayload {
  reason?: string;
  wasClean: boolean;
}

// Room event payloads
export interface RoomJoinedPayload extends NetworkEventPayload {
  roomId: string;
  participants: string[];
}

export interface RoomLeftPayload extends NetworkEventPayload {
  roomId: string;
}

export interface RoomCreatedPayload extends NetworkEventPayload {
  roomId: string;
  creatorId: string;
}

// Message event payloads
export interface MessageReceivedPayload extends NetworkEventPayload {
  senderId: string;
  content: any;
  messageType?: string;
}

export interface MessageSentPayload extends NetworkEventPayload {
  recipientId?: string; // undefined for broadcast
  content: any;
  messageType?: string;
}

// Audio node event payloads
export interface NodeEventBasePayload extends NetworkEventPayload {
  nodeId: string;
}

export interface NodeCreatedPayload extends NodeEventBasePayload {
  nodeType: string;
  position: Vector3;
  rotation?: Quaternion;
  parameters?: Record<string, any>;
}

export interface NodeDeletedPayload extends NodeEventBasePayload {}

export interface NodeMovedPayload extends NodeEventBasePayload {
  position: Vector3;
}

export interface NodeRotatedPayload extends NodeEventBasePayload {
  rotation: Quaternion;
}

export interface NodeParameterChangedPayload extends NodeEventBasePayload {
  parameterName: string;
  value: any;
}

// Error event payloads
export interface NetworkErrorPayload extends NetworkEventPayload {
  code: number;
  message: string;
  details?: any;
}

/**
 * NetworkEventBus - Specialized event bus for network events
 * 
 * This implementation breaks the circular dependency between PlayerManager and NetworkManager
 * by allowing them to communicate through events rather than direct method calls.
 */
export class NetworkEventBus extends BaseEventBus<NetworkEventType, NetworkEventPayload> {
  private static instance: NetworkEventBus;

  private constructor() {
    super();
  }

  /**
   * Get the singleton instance of NetworkEventBus
   */
  public static getInstance(): NetworkEventBus {
    if (!NetworkEventBus.instance) {
      NetworkEventBus.instance = new NetworkEventBus();
    }
    return NetworkEventBus.instance;
  }

  /**
   * Helper method to emit player joined event
   */
  public emitPlayerJoined(payload: PlayerJoinedPayload): void {
    this.emit(NetworkEventType.PLAYER_JOINED, payload);
  }

  /**
   * Helper method to emit player left event
   */
  public emitPlayerLeft(payload: PlayerLeftPayload): void {
    this.emit(NetworkEventType.PLAYER_LEFT, payload);
  }

  /**
   * Helper method to emit player moved event
   */
  public emitPlayerMoved(payload: PlayerMovedPayload): void {
    this.emit(NetworkEventType.PLAYER_MOVED, payload);
  }

  /**
   * Helper method to emit node created event
   */
  public emitNodeCreated(payload: NodeCreatedPayload): void {
    this.emit(NetworkEventType.NODE_CREATED, payload);
  }

  /**
   * Helper method to emit node deleted event
   */
  public emitNodeDeleted(payload: NodeDeletedPayload): void {
    this.emit(NetworkEventType.NODE_DELETED, payload);
  }

  /**
   * Helper method to emit node moved event
   */
  public emitNodeMoved(payload: NodeMovedPayload): void {
    this.emit(NetworkEventType.NODE_MOVED, payload);
  }

  /**
   * Helper method to emit network error event
   */
  public emitNetworkError(payload: NetworkErrorPayload): void {
    this.emit(NetworkEventType.NETWORK_ERROR, payload);
  }

  /**
   * Helper method to emit connection established event
   */
  public emitConnectionEstablished(payload: ConnectionEstablishedPayload): void {
    this.emit(NetworkEventType.CONNECTION_ESTABLISHED, payload);
  }

  /**
   * Helper method to emit connection lost event
   */
  public emitConnectionLost(payload: ConnectionLostPayload): void {
    this.emit(NetworkEventType.CONNECTION_LOST, payload);
  }
}

