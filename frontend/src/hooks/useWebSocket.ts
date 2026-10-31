import { useEffect, useRef, useCallback } from "react";
import { useRoomStore } from "../stores/roomStore";
import { WSMessage } from "../types";
import { webrtc } from "../lib/webrtc";
import { sounds } from "../lib/soundEffects";

export function useWebSocket(url: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);

  const {
    setWsConnected,
    setAdmission,
    setRoomState,
    updateUser,
    removeUser,
    updateLayout,
    addChatMessage,
    setShareMode,
    addWhiteboardStroke,
    clearWhiteboard,
    setWhiteboardPage,
    setPoll,
    removePoll,
    setNotes,
    setBreakouts,
    setBreakoutBroadcast,
    setDocumentState,
    setDocumentPage,
    setDocumentSyncMode,
    addDocumentStroke,
    clearDocumentStrokes,
    setTransport,
    setUserMediaState,
    setIsRecording,
    addCompletedRecording,
    setPing,
    setPeerPing,
  } = useRoomStore();

  const sendMessage = useCallback((msg: WSMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    webrtc.setSendFunction(sendMessage);
  }, [sendMessage]);

  useEffect(() => {
    if (!url) return;
    const targetUrl = url;

    let isMounted = true;

    function connect() {
      if (wsRef.current) {
        wsRef.current.close();
      }

      const ws = new WebSocket(targetUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setWsConnected(true);

        // Latency and heartbeat ping every 3 seconds
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "PING", clientTime: Date.now() }));
          } else if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            connect();
          }
        }, 3000);
      };

      ws.onclose = (event) => {
        if (!isMounted) return;
        setWsConnected(false);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

        if (event.code === 4001 || event.code === 4002) {
          // Kicked or denied admission, do not auto-reconnect
          return;
        }

        // Fast reconnect
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = window.setTimeout(connect, 1500);
      };

      ws.onerror = (err) => {
        console.warn("WebSocket error:", err);
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const msg = JSON.parse(event.data) as WSMessage;

          switch (msg.type) {
            case "ADMISSION_REQUIRED":
              setAdmission(false, msg.message);
              break;

            case "ADMISSION_APPROVED": {
              setAdmission(true);
              const curRoom = useRoomStore.getState().roomState?.roomId;
              if (msg.token) {
                if (curRoom) {
                  document.cookie = `classroom_admit_${curRoom}=${msg.token}; path=/; max-age=86400`;
                  localStorage.setItem(`classroom_admit_${curRoom}`, msg.token);
                }
                localStorage.setItem(`classroom_last_token`, msg.token);
              }
              break;
            }

            case "ROOM_STATE":
              setAdmission(true);
              setRoomState(msg.state);
              if (msg.state.roomId) {
                const lastToken = localStorage.getItem(`classroom_last_token`);
                if (lastToken) {
                  document.cookie = `classroom_admit_${msg.state.roomId}=${lastToken}; path=/; max-age=86400`;
                  localStorage.setItem(`classroom_admit_${msg.state.roomId}`, lastToken);
                }
              }
              break;

            case "USER_JOINED":
              updateUser(msg.user);
              if (msg.user.admitted) {
                sounds.playUserJoin();
                // If we are broadcasting media, connect to newly admitted user
                const { isMicOn, isCamOn, isScreenSharing, currentUser } =
                  useRoomStore.getState();
                if ((isMicOn || isCamOn || isScreenSharing) && currentUser) {
                  webrtc.connectToPeer(msg.user.id);
                }
              }
              break;

            case "USER_LEFT":
              removeUser(msg.userId);
              webrtc.closePeer(msg.userId);
              break;

            case "USER_UPDATED": {
              const prev = useRoomStore.getState().roomState?.users[msg.user.id];
              updateUser(msg.user);
              if (prev && !prev.admitted && msg.user.admitted) {
                sounds.playUserJoin();
                const { isMicOn, isCamOn, isScreenSharing, currentUser } =
                  useRoomStore.getState();
                if ((isMicOn || isCamOn || isScreenSharing) && currentUser) {
                  webrtc.connectToPeer(msg.user.id);
                }
              }
              break;
            }

            case "KICK_USER":
              alert(msg.reason || "You have been removed from the room.");
              window.location.reload();
              break;

            case "UPDATE_LAYOUT":
              updateLayout(msg.layout);
              break;

            case "CHAT_MESSAGE":
              addChatMessage(msg);
              break;

            case "SET_SHARE_MODE":
              setShareMode(msg.mode);
              break;

            case "WHITEBOARD_STROKE":
              addWhiteboardStroke(msg.stroke);
              break;

            case "WHITEBOARD_CLEAR":
              clearWhiteboard(msg.pageId);
              break;

            case "WHITEBOARD_PAGE_CHANGE":
              setWhiteboardPage(msg.pageId);
              break;

            case "AUTH_ERROR":
              alert(msg.message || "خطای ورود: دسترسی غیرمجاز");
              window.location.reload();
              break;

            case "DOC_CHANGE":
              setDocumentState(msg.docState);
              break;

            case "DOC_PAGE_CHANGE":
              setDocumentPage(msg.page, msg.zoom, msg.panX, msg.panY);
              break;

            case "DOC_SYNC_MODE":
              setDocumentSyncMode(msg.syncMode);
              break;

            case "DOC_STROKE":
              addDocumentStroke(msg.stroke);
              break;

            case "DOC_CLEAR_STROKES":
              clearDocumentStrokes(msg.page);
              break;

            case "POLL_CREATE":
              setPoll(msg.poll);
              break;

            case "POLL_REMOVE":
              removePoll(msg.pollId);
              break;

            case "NOTE_UPDATE":
              setNotes(msg.content, msg.version);
              break;

            case "BREAKOUT_START":
              setBreakouts(true, msg.rooms);
              break;

            case "BREAKOUT_BROADCAST":
              setBreakoutBroadcast(msg.text);
              setTimeout(() => setBreakoutBroadcast(null), 8000);
              break;

            case "BREAKOUT_END":
              setBreakouts(false, []);
              break;

            case "SIGNAL_OFFER":
              webrtc.handleOffer(msg.senderId, msg.sdp);
              break;

            case "SIGNAL_ANSWER":
              webrtc.handleAnswer(msg.senderId, msg.sdp);
              break;

            case "SIGNAL_ICE":
              webrtc.handleIceCandidate(msg.senderId, msg.candidate);
              break;

            case "PONG":
              if (msg.clientTime) {
                const latency = Date.now() - msg.clientTime;
                setPing(latency);
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "PING_UPDATE", ping: latency }));
                }
              }
              break;

            case "PING_UPDATE":
              setPeerPing(msg.userId, msg.ping);
              break;

            case "UPDATE_TRANSPORT":
              setTransport(msg.transport);
              break;

            case "MEDIA_STATE":
              setUserMediaState(msg.userId, msg.mediaState);
              break;

            case "RECORDING_STATE":
              setIsRecording(msg.isRecording);
              break;

            case "RECORDING_FINISHED":
              addCompletedRecording({
                id: msg.recordingId,
                title: msg.title,
                downloadUrl: msg.downloadUrl,
                createdAt: Date.now(),
              });
              break;

            case "ROOM_ENDED":
              alert(msg.reason || "کلاس توسط مدیر به پایان رسید.");
              window.location.href = window.location.pathname;
              break;
          }
        } catch (e) {
          console.error("Error processing WS message:", e);
        }
      };
    }

    const handleOnline = () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          connect();
        }
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    connect();

    return () => {
      isMounted = false;
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
      webrtc.closeAll();
    };
  }, [url]);

  return { sendMessage };
}
