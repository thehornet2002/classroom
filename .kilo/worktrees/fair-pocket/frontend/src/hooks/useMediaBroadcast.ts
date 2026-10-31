import { useCallback, useRef } from "react";
import { useRoomStore } from "../stores/roomStore";
import { webrtc } from "../lib/webrtc";
import { WSMessage } from "../types";

export function useMediaBroadcast(sendMessage: (msg: WSMessage) => void) {
  const audioStreamRef = useRef<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const {
    isMicOn,
    isCamOn,
    isScreenSharing,
    setMediaDevicesState,
    setLocalStream,
    setLocalAudioStream,
    currentUser,
    roomState,
  } = useRoomStore();

  const syncPeers = useCallback(() => {
    // Determine active video stream: screen share takes precedence over camera
    const activeVideoStream = screenStreamRef.current || videoStreamRef.current || null;
    const activeAudioStream = audioStreamRef.current || null;

    setLocalStream(activeVideoStream);
    setLocalAudioStream(activeAudioStream);
    webrtc.setLocalStreams(activeVideoStream, activeAudioStream);

    // If we have active streams, initiate connection to new peers in room
    if ((activeVideoStream || activeAudioStream) && roomState) {
      for (const peerId of Object.keys(roomState.users)) {
        if (peerId !== currentUser?.id && !webrtc.hasPeer(peerId)) {
          webrtc.connectToPeer(peerId);
        }
      }
    }
  }, [currentUser, roomState, setLocalStream, setLocalAudioStream]);

  // Toggle Microphone
  const toggleMic = useCallback(async () => {
    if (isMicOn) {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
      }
      setMediaDevicesState(false, isCamOn, isScreenSharing);
      syncPeers();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        audioStreamRef.current = stream;
        setMediaDevicesState(true, isCamOn, isScreenSharing);
        syncPeers();
      } catch (err) {
        console.error("Microphone access denied or error:", err);
        alert("Could not access microphone.");
      }
    }
  }, [isMicOn, isCamOn, isScreenSharing, setMediaDevicesState, syncPeers]);

  // Toggle Webcam
  const toggleCam = useCallback(async () => {
    if (isCamOn) {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((t) => t.stop());
        videoStreamRef.current = null;
      }
      setMediaDevicesState(isMicOn, false, isScreenSharing);
      syncPeers();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 24, max: 30 },
          },
        });
        videoStreamRef.current = stream;
        setMediaDevicesState(isMicOn, true, isScreenSharing);
        sendMessage({ type: "SET_SHARE_MODE", mode: "camera" });
        syncPeers();
      } catch (err) {
        console.error("Webcam access error:", err);
        alert("Could not access camera.");
      }
    }
  }, [isMicOn, isCamOn, isScreenSharing, setMediaDevicesState, sendMessage, syncPeers]);

  // Toggle Screen Share
  const toggleScreen = useCallback(async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setMediaDevicesState(isMicOn, isCamOn, false);
      syncPeers();
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "monitor",
          },
          audio: true,
        });

        screenStreamRef.current = stream;
        setMediaDevicesState(isMicOn, isCamOn, true);
        sendMessage({ type: "SET_SHARE_MODE", mode: "screen" });
        syncPeers();

        // Handle user stopping screen share from browser banner
        stream.getVideoTracks()[0].onended = () => {
          screenStreamRef.current = null;
          setMediaDevicesState(isMicOn, isCamOn, false);
          syncPeers();
        };
      } catch (err) {
        console.error("Screen share error:", err);
      }
    }
  }, [isScreenSharing, isMicOn, isCamOn, setMediaDevicesState, sendMessage, syncPeers]);

  return {
    toggleMic,
    toggleCam,
    toggleScreen,
  };
}
