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

export type PodType = "attendee" | "chat" | "share" | "poll" | "notes";
export type ShareMode = "screen" | "camera" | "whiteboard" | "document";

export interface PodConfig {
  id: string;
  type: PodType;
  title: string;
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  w: number; // width percentage (10 - 100)
  h: number; // height percentage (10 - 100)
  minimized?: boolean;
  maximized?: boolean;
  data?: any;
}

export interface LayoutPreset {
  id: string;
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

export interface DocumentState {
  docUrl: string;
  docName: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
}

export interface BreakoutRoom {
  id: string;
  name: string;
  assignedUserIds: string[];
}

export interface RoomState {
  roomId: string;
  roomName: string;
  hostPass?: string;
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

export type WSMessage =
  | { type: "JOIN"; roomId: string; userId: string; name: string; role: UserRole; pass?: string }
  | { type: "ADMISSION_REQUIRED"; message: string }
  | { type: "ADMISSION_DECISION"; targetId: string; approved: boolean }
  | { type: "ROOM_STATE"; state: RoomState }
  | { type: "USER_JOINED"; user: User }
  | { type: "USER_LEFT"; userId: string }
  | { type: "USER_UPDATED"; user: User }
  | { type: "KICK_USER"; targetId: string; reason?: string }
  | { type: "STATUS_CHANGE"; status: UserStatus; targetId?: string }
  | { type: "SET_ROLE"; targetId: string; role: UserRole }
  | { type: "SET_PERMISSIONS"; targetId: string; permissions: Partial<UserPermissions> }
  | { type: "SWITCH_LAYOUT"; layoutId: string }
  | { type: "UPDATE_LAYOUT"; layout: LayoutPreset }
  | { type: "UPDATE_POD"; pod: PodConfig }
  | (ChatMessage & { type: "CHAT_MESSAGE" })
  | { type: "SET_SHARE_MODE"; mode: ShareMode }
  | { type: "WHITEBOARD_STROKE"; stroke: WhiteboardStroke }
  | { type: "WHITEBOARD_CLEAR"; pageId: number }
  | { type: "WHITEBOARD_PAGE_CHANGE"; pageId: number }
  | { type: "DOC_CHANGE"; docState: DocumentState }
  | { type: "DOC_PAGE_CHANGE"; page: number; zoom?: number }
  | { type: "POLL_CREATE"; poll: Poll }
  | { type: "POLL_VOTE"; pollId: string; optionIds?: string[]; textAnswer?: string }
  | { type: "POLL_STATUS"; pollId: string; isOpen: boolean; broadcastResults: boolean }
  | { type: "POLL_REMOVE"; pollId: string }
  | { type: "NOTE_UPDATE"; content: string; version: number }
  | { type: "BREAKOUT_START"; rooms: BreakoutRoom[]; durationMinutes?: number }
  | { type: "BREAKOUT_BROADCAST"; text: string }
  | { type: "BREAKOUT_END" }
  | { type: "SIGNAL_OFFER"; targetId: string; senderId: string; sdp: RTCSessionDescriptionInit }
  | { type: "SIGNAL_ANSWER"; targetId: string; senderId: string; sdp: RTCSessionDescriptionInit }
  | { type: "SIGNAL_ICE"; targetId: string; senderId: string; candidate: RTCIceCandidateInit }
  | { type: "PING" }
  | { type: "PONG" };
