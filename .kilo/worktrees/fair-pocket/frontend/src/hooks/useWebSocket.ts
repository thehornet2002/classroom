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

        // Start ping interval
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "PING" }));
          }
        }, 25000);
      };

      ws.onclose = (event) => {
        if (!isMounted) return;
        setWsConnected(false);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

        if (event.code === 4001 || event.code === 4002) {
          // Kicked or denied admission, do not auto-reconnect
          return;
        }

        // Exponential backoff reconnect
        reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
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

            case "ROOM_STATE":
              setAdmission(true);
              setRoomState(msg.state);
              // Connect WebRTC to existing admitted users if any stream active
              break;

            case "USER_JOINED":
              updateUser(msg.user);
              sounds.playUserJoin();
              // If we are broadcasting media, connect to newly joined user
              {
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

            case "USER_UPDATED":
              updateUser(msg.user);
              break;

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

            case "DOC_CHANGE":
              // update doc state
              break;

            case "DOC_PAGE_CHANGE":
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
          }
        } catch (e) {
          console.error("Error processing WS message:", e);
        }
      };
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
      webrtc.closeAll();
    };
  }, [url]);

  return { sendMessage };
}
