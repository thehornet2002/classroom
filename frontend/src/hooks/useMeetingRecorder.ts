import { useState, useRef, useEffect, useCallback } from "react";
import { useRoomStore } from "../stores/roomStore";
import { WSMessage } from "../types";

export function useMeetingRecorder(sendMessage?: (msg: WSMessage) => void) {
  const [isUploading, setIsUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const durationRef = useRef<number>(0);

  const {
    localAudioStream,
    roomState,
    currentUser,
    isRecording,
    recordingSeconds,
    setIsRecording,
    setRecordingSeconds,
    addCompletedRecording,
  } = useRoomStore();

  const startRecording = useCallback(async () => {
    try {
      // 1. Capture screen with audio
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
        },
        audio: true,
      });

      // 2. Mix screen audio + local microphone if active
      const audioTracks: MediaStreamTrack[] = [];
      displayStream.getAudioTracks().forEach((t) => audioTracks.push(t));

      if (localAudioStream) {
        localAudioStream.getAudioTracks().forEach((t) => audioTracks.push(t));
      }

      let finalStream: MediaStream;
      if (audioTracks.length > 1) {
        const audioCtx = new AudioContext();
        const dest = audioCtx.createMediaStreamDestination();
        audioTracks.forEach((track) => {
          const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
          src.connect(dest);
        });
        finalStream = new MediaStream([
          ...displayStream.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);
      } else {
        finalStream = displayStream;
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

      const recorder = new MediaRecorder(finalStream, { mimeType });
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        const finalDuration = durationRef.current;
        setIsRecording(false);
        setRecordingSeconds(0);
        sendMessage?.({ type: "RECORDING_STATE", isRecording: false });

        // Stop all tracks on display stream
        displayStream.getTracks().forEach((t) => t.stop());

        if (recordedChunksRef.current.length === 0) return;

        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        setIsUploading(true);

        try {
          const res = await fetch("/api/recordings/upload", {
            method: "POST",
            headers: {
              "x-session-id": roomState?.roomId || "main",
              "x-title": encodeURIComponent(roomState?.roomName || "کلاس آنلاین"),
              "x-teacher": encodeURIComponent(currentUser?.name || "استاد"),
              "x-duration": String(finalDuration),
            },
            body: blob,
          });

          const data = await res.json();
          if (data.recordingId && data.downloadUrl) {
            const finishedRec = {
              id: data.recordingId,
              title: roomState?.roomName || "کلاس آنلاین",
              downloadUrl: data.downloadUrl,
              createdAt: Date.now(),
            };
            addCompletedRecording(finishedRec);
            sendMessage?.({
              type: "RECORDING_FINISHED",
              recordingId: data.recordingId,
              title: finishedRec.title,
              downloadUrl: data.downloadUrl,
            });
          }
        } catch (err) {
          console.error("Failed to upload recording to server:", err);
        } finally {
          setIsUploading(false);
        }
      };

      displayStream.getVideoTracks()[0].onended = () => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      };

      recorder.start(1000); // 1s slice
      setIsRecording(true);
      setRecordingSeconds(0);
      durationRef.current = 0;
      sendMessage?.({ type: "RECORDING_STATE", isRecording: true });

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        durationRef.current += 1;
        setRecordingSeconds(durationRef.current);
      }, 1000);
    } catch (err) {
      console.error("Recording error or canceled:", err);
    }
  }, [localAudioStream, roomState, currentUser, setIsRecording, setRecordingSeconds, addCompletedRecording, sendMessage]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return {
    isRecording,
    isUploading,
    recordingTimeStr: formatTime(recordingSeconds),
    startRecording,
    stopRecording,
  };
}
