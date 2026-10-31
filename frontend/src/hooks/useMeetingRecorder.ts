import { useState, useRef, useEffect, useCallback } from "react";
import { useRoomStore } from "../stores/roomStore";

export function useMeetingRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const { localAudioStream } = useRoomStore();

  const startRecording = useCallback(async () => {
    try {
      // 1. Capture screen with system audio
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
        },
        audio: true,
      });

      // 2. Mix screen audio + local mic if active
      const audioTracks: MediaStreamTrack[] = [];
      displayStream.getAudioTracks().forEach((t) => audioTracks.push(t));

      if (localAudioStream) {
        localAudioStream.getAudioTracks().forEach((t) => audioTracks.push(t));
      }

      // If multiple audio tracks exist, mix them using AudioContext
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

      recorder.onstop = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        setRecordingSeconds(0);
        setIsRecording(false);

        // Stop all tracks on display stream
        displayStream.getTracks().forEach((t) => t.stop());

        if (recordedChunksRef.current.length === 0) return;

        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        a.href = url;
        a.download = `Classroom-Recording-${dateStr}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        // Upload to server disk if running on Server edition
        try {
          const wsUrl = localStorage.getItem("classroom_ws_url");
          let httpTarget = window.location.origin;
          if (wsUrl) {
            httpTarget = wsUrl.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://").replace(/\/ws.*$/i, "");
          }
          fetch(`${httpTarget}/api/recordings`, {
            method: "POST",
            body: blob,
          }).catch(() => {});
        } catch (e) {}
      };

      // Also handle user stopping sharing via browser stop button
      displayStream.getVideoTracks()[0].onended = () => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      };

      recorder.start(1000); // 1s slice chunks
      setIsRecording(true);
      setRecordingSeconds(0);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Recording error or canceled:", err);
    }
  }, [localAudioStream]);

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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  return {
    isRecording,
    recordingSeconds,
    recordingTimeStr: formatTime(recordingSeconds),
    startRecording,
    stopRecording,
  };
}
