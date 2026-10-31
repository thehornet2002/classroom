import { create } from "zustand";
import {
  ChatMessage,
  DocumentState,
  DocumentStroke,
  LayoutPreset,
  PodConfig,
  RoomState,
  ShareMode,
  TransportConfig,
  User,
  UserPermissions,
  UserRole,
  UserStatus,
  WhiteboardStroke,
  Poll,
} from "../types";
import { sounds } from "../lib/soundEffects";

interface RoomStoreState {
  // Connection & User
  wsConnected: boolean;
  isAdmitted: boolean;
  admissionMessage: string;
  currentUser: User | null;
  roomState: RoomState | null;
  transport: TransportConfig;
  ping: number;
  peerPings: Record<string, number>;

  // Media
  isMicOn: boolean;
  isCamOn: boolean;
  isScreenSharing: boolean;
  localStream: MediaStream | null;
  localCamStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  localAudioStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>; // peerId -> stream
  userMediaStates: Record<string, { isMicOn: boolean; isCamOn: boolean; isScreenOn: boolean }>;

  // Server Recording
  isRecording: boolean;
  recordingSeconds: number;
  completedRecordings: { id: string; title: string; downloadUrl: string; createdAt: number }[];

  // Chat
  chatMessages: ChatMessage[];
  activeChannel: "everyone" | "hosts" | string;
  unreadCount: Record<string, number>;

  // Prepare Mode (Host can edit layout without broadcasting immediately)
  prepareMode: boolean;

  // Breakout notification
  breakoutBroadcast: string | null;

  // Actions
  setWsConnected: (connected: boolean) => void;
  setAdmission: (admitted: boolean, message?: string) => void;
  setPing: (ping: number) => void;
  setPeerPing: (peerId: string, ping: number) => void;
  setCurrentUser: (user: User | null) => void;
  setRoomState: (state: RoomState) => void;
  setTransport: (transport: TransportConfig) => void;
  updateUser: (user: User) => void;
  removeUser: (userId: string) => void;
  updateLayout: (layout: LayoutPreset) => void;
  updatePod: (pod: PodConfig) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setActiveChannel: (channel: string) => void;
  setShareMode: (mode: ShareMode) => void;
  setDocumentState: (docState: DocumentState | null) => void;
  setDocumentPage: (page: number, zoom?: number, panX?: number, panY?: number) => void;
  setDocumentSyncMode: (syncMode: "sync" | "free") => void;
  addDocumentStroke: (stroke: DocumentStroke) => void;
  clearDocumentStrokes: (page: number) => void;
  addWhiteboardStroke: (stroke: WhiteboardStroke) => void;
  clearWhiteboard: (pageId: number) => void;
  setWhiteboardPage: (pageId: number) => void;
  setPoll: (poll: Poll) => void;
  removePoll: (pollId: string) => void;
  setNotes: (content: string, version: number) => void;
  setBreakouts: (active: boolean, rooms: any[]) => void;
  setBreakoutBroadcast: (msg: string | null) => void;
  setPrepareMode: (enabled: boolean) => void;
  setMediaDevicesState: (mic: boolean, cam: boolean, screen: boolean) => void;
  setUserMediaState: (userId: string, mediaState: { isMicOn: boolean; isCamOn: boolean; isScreenOn: boolean }) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setLocalCamStream: (stream: MediaStream | null) => void;
  setLocalScreenStream: (stream: MediaStream | null) => void;
  setLocalAudioStream: (stream: MediaStream | null) => void;
  setRemoteStream: (peerId: string, stream: MediaStream | null) => void;
  setIsRecording: (recording: boolean) => void;
  setRecordingSeconds: (seconds: number) => void;
  addCompletedRecording: (rec: { id: string; title: string; downloadUrl: string; createdAt: number }) => void;
}

export const useRoomStore = create<RoomStoreState>((set, get) => ({
  wsConnected: false,
  isAdmitted: true,
  admissionMessage: "",
  currentUser: null,
  roomState: null,
  transport: {
    audio: "udp",
    video: "udp",
    data: "udp",
  },
  ping: 0,
  peerPings: {},

  isMicOn: false,
  isCamOn: false,
  isScreenSharing: false,
  localStream: null,
  localCamStream: null,
  localScreenStream: null,
  localAudioStream: null,
  remoteStreams: {},
  userMediaStates: {},

  isRecording: false,
  recordingSeconds: 0,
  completedRecordings: [],

  chatMessages: [],
  activeChannel: "everyone",
  unreadCount: {},
  prepareMode: false,
  breakoutBroadcast: null,

  setWsConnected: (connected) => set({ wsConnected: connected }),
  setAdmission: (admitted, message = "") =>
    set({ isAdmitted: admitted, admissionMessage: message }),
  setPing: (ping) => set({ ping }),
  setPeerPing: (peerId, ping) =>
    set((prev) => ({ peerPings: { ...prev.peerPings, [peerId]: ping } })),
  setCurrentUser: (user) => set({ currentUser: user }),
  setRoomState: (state) => {
    const current = get().currentUser;
    const updatedCurrent = current && state.users[current.id] ? state.users[current.id] : current;
    set((prev) => ({
      roomState: state,
      currentUser: updatedCurrent,
      transport: state.transport || prev.transport,
      chatMessages: state.chatMessages && state.chatMessages.length > 0 ? state.chatMessages : prev.chatMessages,
    }));
  },
  setTransport: (transport) => set({ transport }),

  updateUser: (user) => {
    const { roomState, currentUser } = get();
    if (roomState) {
      const prevUser = roomState.users[user.id];
      if (prevUser && prevUser.status !== "raised_hand" && user.status === "raised_hand") {
        sounds.playHandRaise();
      }
      set({
        roomState: {
          ...roomState,
          users: { ...roomState.users, [user.id]: user },
        },
      });
    }
    if (currentUser && currentUser.id === user.id) {
      set({ currentUser: user });
    }
  },

  removeUser: (userId) => {
    const { roomState, remoteStreams } = get();
    if (roomState) {
      const newUsers = { ...roomState.users };
      delete newUsers[userId];
      set({ roomState: { ...roomState, users: newUsers } });
    }
    if (remoteStreams[userId]) {
      const newStreams = { ...remoteStreams };
      delete newStreams[userId];
      set({ remoteStreams: newStreams });
    }
  },

  updateLayout: (layout) => {
    const { roomState } = get();
    if (roomState) {
      set({
        roomState: {
          ...roomState,
          currentLayout: layout,
          activeLayoutId: layout.id,
        },
      });
    }
  },

  updatePod: (pod) => {
    const { roomState } = get();
    if (!roomState) return;
    const pods = [...roomState.currentLayout.pods];
    const idx = pods.findIndex((p) => p.id === pod.id);
    if (idx !== -1) {
      pods[idx] = pod;
    } else {
      pods.push(pod);
    }
    set({
      roomState: {
        ...roomState,
        currentLayout: {
          ...roomState.currentLayout,
          pods,
        },
      },
    });
  },

  addChatMessage: (msg) => {
    const { activeChannel, unreadCount, currentUser } = get();
    if (currentUser && msg.senderId !== currentUser.id) {
      sounds.playChatPop();
      if (activeChannel !== msg.channel) {
        set({
          unreadCount: {
            ...unreadCount,
            [msg.channel]: (unreadCount[msg.channel] || 0) + 1,
          },
        });
      }

      // Windows / Desktop notification
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          try {
            new Notification(`Classroom: ${msg.senderName}`, {
              body: msg.text,
            });
          } catch (e) {}
        } else if (Notification.permission === "default") {
          Notification.requestPermission().catch(() => {});
        }
      }
    }
    set((state) => ({ chatMessages: [...state.chatMessages, msg] }));
  },

  setActiveChannel: (channel) =>
    set((state) => ({
      activeChannel: channel,
      unreadCount: { ...state.unreadCount, [channel]: 0 },
    })),

  setShareMode: (mode) => {
    const { roomState } = get();
    if (roomState) {
      set({ roomState: { ...roomState, shareMode: mode } });
    }
  },

  setDocumentState: (docState) => {
    const { roomState } = get();
    if (roomState) {
      set({ roomState: { ...roomState, documentState: docState || undefined } });
    }
  },

  setDocumentPage: (page, zoom, panX, panY) => {
    const { roomState } = get();
    if (roomState && roomState.documentState) {
      set({
        roomState: {
          ...roomState,
          documentState: {
            ...roomState.documentState,
            currentPage: page,
            zoom: zoom !== undefined ? zoom : roomState.documentState.zoom,
            panX: panX !== undefined ? panX : roomState.documentState.panX,
            panY: panY !== undefined ? panY : roomState.documentState.panY,
          },
        },
      });
    }
  },

  setDocumentSyncMode: (syncMode) => {
    const { roomState } = get();
    if (roomState && roomState.documentState) {
      set({
        roomState: {
          ...roomState,
          documentState: {
            ...roomState.documentState,
            syncMode,
          },
        },
      });
    }
  },

  addDocumentStroke: (stroke) => {
    const { roomState } = get();
    if (roomState && roomState.documentState) {
      const strokes = roomState.documentState.strokes || [];
      set({
        roomState: {
          ...roomState,
          documentState: {
            ...roomState.documentState,
            strokes: [...strokes, stroke],
          },
        },
      });
    }
  },

  clearDocumentStrokes: (page) => {
    const { roomState } = get();
    if (roomState && roomState.documentState && roomState.documentState.strokes) {
      set({
        roomState: {
          ...roomState,
          documentState: {
            ...roomState.documentState,
            strokes: roomState.documentState.strokes.filter((s) => s.page !== page),
          },
        },
      });
    }
  },

  addWhiteboardStroke: (stroke) => {
    const { roomState } = get();
    if (roomState) {
      set({
        roomState: {
          ...roomState,
          whiteboardStrokes: [...roomState.whiteboardStrokes, stroke],
        },
      });
    }
  },

  clearWhiteboard: (pageId) => {
    const { roomState } = get();
    if (roomState) {
      set({
        roomState: {
          ...roomState,
          whiteboardStrokes: roomState.whiteboardStrokes.filter(
            (s) => s.pageId !== pageId
          ),
        },
      });
    }
  },

  setWhiteboardPage: (pageId) => {
    const { roomState } = get();
    if (roomState) {
      set({ roomState: { ...roomState, whiteboardPage: pageId } });
    }
  },

  setPoll: (poll) => {
    const { roomState } = get();
    if (roomState) {
      set({
        roomState: {
          ...roomState,
          polls: { ...roomState.polls, [poll.id]: poll },
          activePollId: poll.id,
        },
      });
    }
  },

  removePoll: (pollId) => {
    const { roomState } = get();
    if (roomState) {
      const newPolls = { ...roomState.polls };
      delete newPolls[pollId];
      set({
        roomState: {
          ...roomState,
          polls: newPolls,
          activePollId:
            roomState.activePollId === pollId ? undefined : roomState.activePollId,
        },
      });
    }
  },

  setNotes: (content, version) => {
    const { roomState } = get();
    if (roomState) {
      set({
        roomState: {
          ...roomState,
          notesContent: content,
          notesVersion: version,
        },
      });
    }
  },

  setBreakouts: (active, rooms) => {
    const { roomState } = get();
    if (roomState) {
      set({
        roomState: {
          ...roomState,
          breakoutsActive: active,
          breakoutRooms: rooms,
        },
      });
    }
  },

  setBreakoutBroadcast: (msg) => set({ breakoutBroadcast: msg }),
  setPrepareMode: (enabled) => set({ prepareMode: enabled }),
  setMediaDevicesState: (mic, cam, screen) =>
    set({ isMicOn: mic, isCamOn: cam, isScreenSharing: screen }),
  setUserMediaState: (userId, mediaState) =>
    set((prev) => ({
      userMediaStates: {
        ...prev.userMediaStates,
        [userId]: mediaState,
      },
    })),
  setLocalStream: (stream) => set({ localStream: stream }),
  setLocalCamStream: (stream) => set({ localCamStream: stream }),
  setLocalScreenStream: (stream) => set({ localScreenStream: stream }),
  setLocalAudioStream: (stream) => set({ localAudioStream: stream }),
  setIsRecording: (recording) => set({ isRecording: recording }),
  setRecordingSeconds: (seconds) => set({ recordingSeconds: seconds }),
  addCompletedRecording: (rec) =>
    set((prev) => ({
      completedRecordings: [rec, ...prev.completedRecordings.filter((r) => r.id !== rec.id)],
    })),
  setRemoteStream: (peerId, stream) => {
    const { remoteStreams } = get();
    if (!stream) {
      const copy = { ...remoteStreams };
      delete copy[peerId];
      set({ remoteStreams: copy });
    } else {
      set({ remoteStreams: { ...remoteStreams, [peerId]: stream } });
    }
  },
}));
