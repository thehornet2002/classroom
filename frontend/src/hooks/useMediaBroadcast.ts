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
    setLocalCamStream,
    setLocalScreenStream,
    setLocalAudioStream,
    setUserMediaState,
    currentUser,
    roomState,
  } = useRoomStore();

  const broadcastMediaState = useCallback(
    (mic: boolean, cam: boolean, screen: boolean) => {
      if (!currentUser) return;
      const mediaState = { isMicOn: mic, isCamOn: cam, isScreenOn: screen };
      setUserMediaState(currentUser.id, mediaState);
      sendMessage({
        type: "MEDIA_STATE",
        userId: currentUser.id,
        mediaState,
      });
      webrtc.sendRealtimeData({
        type: "MEDIA_STATE",
        userId: currentUser.id,
        mediaState,
      });
    },
    [currentUser, setUserMediaState, sendMessage]
  );

  const syncPeers = useCallback(
    (activeCam: MediaStream | null, activeScreen: MediaStream | null, activeAudio: MediaStream | null) => {
      // Primary video stream for WebRTC transceiver: screen share if sharing, else webcam
      const activeVideoStream = activeScreen || activeCam || null;

      setLocalStream(activeVideoStream);
      setLocalCamStream(activeCam);
      setLocalScreenStream(activeScreen);
      setLocalAudioStream(activeAudio);
      webrtc.setLocalStreams(activeVideoStream, activeAudio);

      // If we have active streams, initiate connection to new peers in room
      if ((activeVideoStream || activeAudio) && roomState) {
        for (const peerId of Object.keys(roomState.users)) {
          if (peerId !== currentUser?.id && !webrtc.hasPeer(peerId)) {
            webrtc.connectToPeer(peerId);
          }
        }
      }
    },
    [currentUser, roomState, setLocalStream, setLocalCamStream, setLocalScreenStream, setLocalAudioStream]
  );

  // Toggle Microphone
  const toggleMic = useCallback(async () => {
    if (isMicOn) {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
      }
      setMediaDevicesState(false, isCamOn, isScreenSharing);
      broadcastMediaState(false, isCamOn, isScreenSharing);
      syncPeers(videoStreamRef.current, screenStreamRef.current, null);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1,
          },
        });
        audioStreamRef.current = stream;
        setMediaDevicesState(true, isCamOn, isScreenSharing);
        broadcastMediaState(true, isCamOn, isScreenSharing);
        syncPeers(videoStreamRef.current, screenStreamRef.current, stream);
      } catch (err) {
        console.error("Microphone access denied or error:", err);
        alert("امکان دسترسی به میکروفون میسر نشد.");
      }
    }
  }, [isMicOn, isCamOn, isScreenSharing, setMediaDevicesState, broadcastMediaState, syncPeers]);

  // Toggle Webcam (Does not affect or trigger Screen Share)
  const toggleCam = useCallback(async () => {
    if (isCamOn) {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((t) => t.stop());
        videoStreamRef.current = null;
      }
      setMediaDevicesState(isMicOn, false, isScreenSharing);
      broadcastMediaState(isMicOn, false, isScreenSharing);
      syncPeers(null, screenStreamRef.current, audioStreamRef.current);
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
        broadcastMediaState(isMicOn, true, isScreenSharing);
        syncPeers(stream, screenStreamRef.current, audioStreamRef.current);
      } catch (err) {
        console.error("Webcam access error:", err);
        alert("امکان دسترسی به وبکم میسر نشد.");
      }
    }
  }, [isMicOn, isCamOn, isScreenSharing, setMediaDevicesState, broadcastMediaState, syncPeers]);

  // Toggle Screen Share (Separated from Camera)
  const toggleScreen = useCallback(async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setMediaDevicesState(isMicOn, isCamOn, false);
      broadcastMediaState(isMicOn, isCamOn, false);
      syncPeers(videoStreamRef.current, null, audioStreamRef.current);
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
        broadcastMediaState(isMicOn, isCamOn, true);
        syncPeers(videoStreamRef.current, stream, audioStreamRef.current);

        // Handle user stopping screen share from browser banner
        stream.getVideoTracks()[0].onended = () => {
          screenStreamRef.current = null;
          setMediaDevicesState(isMicOn, isCamOn, false);
          broadcastMediaState(isMicOn, isCamOn, false);
          syncPeers(videoStreamRef.current, null, audioStreamRef.current);
        };
      } catch (err) {
        console.error("Screen share error:", err);
      }
    }
  }, [isScreenSharing, isMicOn, isCamOn, setMediaDevicesState, sendMessage, broadcastMediaState, syncPeers]);

  return {
    toggleMic,
    toggleCam,
    toggleScreen,
  };
}
