import {
  LayoutPreset,
  RoomState,
  User,
  UserRole,
  WSMessage,
  WhiteboardStroke,
  Poll,
} from "./types";

export const DEFAULT_LAYOUTS: Record<string, LayoutPreset> = {
  sharing: {
    id: "sharing",
    name: "Sharing",
    pods: [
      { id: "share-1", type: "share", title: "Share Pod", x: 0, y: 0, w: 72, h: 100 },
      { id: "camera-1", type: "camera", title: "Video", x: 72, y: 0, w: 28, h: 28 },
      { id: "attendee-1", type: "attendee", title: "Attendees", x: 72, y: 28, w: 28, h: 36 },
      { id: "chat-1", type: "chat", title: "Chat", x: 72, y: 64, w: 28, h: 36 },
    ],
  },
  discussion: {
    id: "discussion",
    name: "Discussion",
    pods: [
      { id: "camera-1", type: "camera", title: "Video", x: 0, y: 0, w: 60, h: 50 },
      { id: "chat-1", type: "chat", title: "Discussion Chat", x: 0, y: 50, w: 60, h: 50 },
      { id: "attendee-1", type: "attendee", title: "Attendees", x: 60, y: 0, w: 40, h: 50 },
      { id: "notes-1", type: "notes", title: "Discussion Notes", x: 60, y: 50, w: 40, h: 50 },
    ],
  },
  collaboration: {
    id: "collaboration",
    name: "Collaboration",
    pods: [
      { id: "share-1", type: "share", title: "Whiteboard", x: 0, y: 0, w: 65, h: 100 },
      { id: "camera-1", type: "camera", title: "Video", x: 65, y: 0, w: 35, h: 25 },
      { id: "attendee-1", type: "attendee", title: "Attendees", x: 65, y: 25, w: 35, h: 35 },
      { id: "chat-1", type: "chat", title: "Chat", x: 65, y: 60, w: 35, h: 40 },
    ],
  },
};

export function createInitialRoomState(roomId: string, roomName = "Adobe Connect Room"): RoomState {
  return {
    roomId,
    roomName,
    registeredUsers: {},
    activeLayoutId: "sharing",
    currentLayout: JSON.parse(JSON.stringify(DEFAULT_LAYOUTS.sharing)),
    users: {},
    shareMode: "screen",
    whiteboardPage: 1,
    whiteboardStrokes: [],
    polls: {},
    notesContent: "Welcome to the session!\nFeel free to take notes here.",
    notesVersion: 1,
    breakoutsActive: false,
    breakoutRooms: [],
    chatMessages: [],
  };
}

export function getDefaultPermissions(role: UserRole) {
  if (role === "host") {
    return {
      canAudio: true,
      canVideo: true,
      canScreen: true,
      canDraw: true,
      canChat: true,
      canShareDoc: true,
    };
  }
  if (role === "presenter") {
    return {
      canAudio: true,
      canVideo: true,
      canScreen: true,
      canDraw: true,
      canChat: true,
      canShareDoc: true,
    };
  }
  return {
    canAudio: false,
    canVideo: false,
    canScreen: false,
    canDraw: false,
    canChat: true,
    canShareDoc: false,
  };
}
