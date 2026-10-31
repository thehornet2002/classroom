export type UserRole = "host" | "presenter" | "participant";

export type UserStatus =
  | "none"
  | "raised_hand"
  | "agree"
  | "disagree"
  | "away"
  | "speak_louder"
  | "speak_softer"
  | "applause"
  | "laughter";

export interface UserPermissions {
  canAudio: boolean;
  canVideo: boolean;
  canScreen: boolean;
  canDraw: boolean;
  canChat: boolean;
  canShareDoc: boolean;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  permissions: UserPermissions;
  joinedAt: number;
  admitted: boolean;
}

export type PodType = "attendee" | "chat" | "share" | "poll" | "notes" | "camera";
export type ShareMode = "screen" | "camera" | "whiteboard" | "document";

export interface PodConfig {
  id: string;
  type: PodType;
  title: string;
  x: number; // percentage or grid col
  y: number; // percentage or grid row
  w: number;
  h: number;
  minimized?: boolean;
  maximized?: boolean;
  data?: any;
}

export interface LayoutPreset {
  id: "sharing" | "discussion" | "collaboration" | string;
  name: string;
  pods: PodConfig[];
}

export interface WhiteboardStroke {
  id: string;
  userId: string;
  pageId: number;
  tool: "pen" | "highlighter" | "line" | "arrow" | "rect" | "circle" | "text" | "eraser";
  color: string;
  size: number;
  points?: { x: number; y: number }[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  text?: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: string[]; // user IDs
}

export interface Poll {
  id: string;
  question: string;
  type: "single" | "multiple" | "text";
  options: PollOption[];
  textAnswers?: { userId: string; userName: string; answer: string }[];
  isOpen: boolean;
  broadcastResults: boolean;
  createdAt: number;
}

export interface DocumentStroke {
  id: string;
  userId: string;
  page: number;
  tool: "pen" | "highlighter" | "line" | "arrow" | "rect" | "circle" | "eraser";
  color: string;
  size: number;
  points?: { x: number; y: number }[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

export interface DocumentState {
  docUrl: string;
  docName: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  panX: number;
  panY: number;
  syncMode: "sync" | "free";
  strokes?: DocumentStroke[];
}

export interface RegisteredUser {
  username: string;
  password: string;
  role: UserRole;
  name: string;
}

export interface BreakoutRoom {
  id: string;
  name: string;
  assignedUserIds: string[];
}

export interface ChatMessage {
  id: string;
  channel: "everyone" | "hosts" | string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  timestamp: number;
}

export interface RoomState {
  roomId: string;
  roomName: string;
  hostPass?: string;
  registeredUsers: Record<string, RegisteredUser>;
  activeLayoutId: string;
  currentLayout: LayoutPreset;
  users: Record<string, User>;
  activePresenterId?: string;
  shareMode: ShareMode;
  whiteboardPage: number;
  whiteboardStrokes: WhiteboardStroke[];
  documentState?: DocumentState;
  polls: Record<string, Poll>;
  activePollId?: string;
  notesContent: string;
  notesVersion: number;
  breakoutsActive: boolean;
  breakoutRooms: BreakoutRoom[];
  chatMessages: ChatMessage[];
}

// Wire Message Protocol
export type WSMessage =
  // Auth & Connection
  | { type: "JOIN"; roomId: string; userId: string; name: string; role: UserRole; pass?: string }
  | { type: "AUTH_ERROR"; message: string }
  | { type: "ADD_USER"; user: RegisteredUser }
  | { type: "DELETE_USER"; username: string }
  | { type: "ADMISSION_REQUIRED"; message: string }
  | { type: "ADMISSION_DECISION"; targetId: string; approved: boolean }
  | { type: "ROOM_STATE"; state: RoomState }
  | { type: "USER_JOINED"; user: User }
  | { type: "USER_LEFT"; userId: string }
  | { type: "USER_UPDATED"; user: User }
  | { type: "KICK_USER"; targetId: string; reason?: string }

  // Status & Roles
  | { type: "STATUS_CHANGE"; status: UserStatus; targetId?: string }
  | { type: "SET_ROLE"; targetId: string; role: UserRole }
  | { type: "SET_PERMISSIONS"; targetId: string; permissions: Partial<UserPermissions> }

  // Layout & Pods
  | { type: "SWITCH_LAYOUT"; layoutId: string }
  | { type: "UPDATE_LAYOUT"; layout: LayoutPreset }
  | { type: "UPDATE_POD"; pod: PodConfig }

  // Chat
  | {
      type: "CHAT_MESSAGE";
      id: string;
      channel: "everyone" | "hosts" | string; // user ID for 1-1 private
      senderId: string;
      senderName: string;
      senderRole: UserRole;
      text: string;
      timestamp: number;
    }

  // Share Pod
  | { type: "SET_SHARE_MODE"; mode: ShareMode }
  | { type: "WHITEBOARD_STROKE"; stroke: WhiteboardStroke }
  | { type: "WHITEBOARD_CLEAR"; pageId: number }
  | { type: "WHITEBOARD_PAGE_CHANGE"; pageId: number }
  | { type: "DOC_CHANGE"; docState: DocumentState }
  | { type: "DOC_PAGE_CHANGE"; page: number; zoom?: number; panX?: number; panY?: number }
  | { type: "DOC_SYNC_MODE"; syncMode: "sync" | "free" }
  | { type: "DOC_STROKE"; stroke: DocumentStroke }
  | { type: "DOC_CLEAR_STROKES"; page: number }

  // Poll
  | { type: "POLL_CREATE"; poll: Poll }
  | { type: "POLL_VOTE"; pollId: string; optionIds?: string[]; textAnswer?: string }
  | { type: "POLL_STATUS"; pollId: string; isOpen: boolean; broadcastResults: boolean }
  | { type: "POLL_REMOVE"; pollId: string }

  // Notes
  | { type: "NOTE_UPDATE"; content: string; version: number }

  // Breakouts
  | { type: "BREAKOUT_START"; rooms: BreakoutRoom[]; durationMinutes?: number }
  | { type: "BREAKOUT_BROADCAST"; text: string }
  | { type: "BREAKOUT_END" }

  // WebRTC Signaling
  | { type: "SIGNAL_OFFER"; targetId: string; senderId: string; sdp: RTCSessionDescriptionInit }
  | { type: "SIGNAL_ANSWER"; targetId: string; senderId: string; sdp: RTCSessionDescriptionInit }
  | { type: "SIGNAL_ICE"; targetId: string; senderId: string; candidate: RTCIceCandidateInit }

  // Keepalive
  | { type: "PING" }
  | { type: "PONG" };
