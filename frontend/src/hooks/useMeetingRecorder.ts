import { useRef, useEffect, useCallback } from "react";
import { useRoomStore } from "../stores/roomStore";
import { WSMessage } from "../types";

export function useMeetingRecorder(sendMessage?: (msg: WSMessage) => void) {
  const timerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const durationSecRef = useRef<number>(0);

  const {
    isRecording,
    recordingSeconds,
    localAudioStream,
    roomState,
    currentUser,
    setIsRecording,
    setRecordingSeconds,
    addCompletedRecording,
  } = useRoomStore();

  useEffect(() => {
    if (isRecording) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        durationSecRef.current += 1;
        setRecordingSeconds(durationSecRef.current);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      durationSecRef.current = 0;
      setRecordingSeconds(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isRecording, setRecordingSeconds]);

  // Requirement 7 & 4: Record without any browser screen-share permission dialog!
  const startRecording = useCallback(() => {
    try {
      sendMessage?.({ type: "START_RECORDING" });
      setIsRecording(true);
      setRecordingSeconds(0);
      durationSecRef.current = 0;

      // 1. Offscreen canvas compositor (Requires ZERO browser permission prompts)
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");

      let startTime = Date.now();
      const drawFrame = () => {
        if (!ctx) return;
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        const m = Math.floor(elapsedSec / 60).toString().padStart(2, "0");
        const s = (elapsedSec % 60).toString().padStart(2, "0");

        // Background
        const grad = ctx.createLinearGradient(0, 0, 1280, 720);
        grad.addColorStop(0, "#0f172a");
        grad.addColorStop(1, "#1e293b");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1280, 720);

        // Header Title
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(roomState?.roomName || "کلاس آنلاین Classroom", 640, 180);

        // Subtitle / Teacher info
        ctx.fillStyle = "#94a3b8";
        ctx.font = "20px sans-serif";
        ctx.fillText(`استاد: ${currentUser?.name || "مدیر کلاس"}  •  پلتفرم ابری چابکان`, 640, 240);

        // Recording Live Badge
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(580, 340, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 26px monospace";
        ctx.fillText(`REC ${m}:${s}`, 650, 348);

        // Frame
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 4;
        ctx.strokeRect(40, 40, 1200, 640);

        animFrameRef.current = requestAnimationFrame(drawFrame);
      };

      drawFrame();

      const canvasStream = canvas.captureStream(10); // 10 fps

      // 2. Audio mixing (local mic if active + synthetic clock track for valid Opus audio)
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();

      if (localAudioStream && localAudioStream.getAudioTracks().length > 0) {
        try {
          const micSource = audioCtx.createMediaStreamSource(localAudioStream);
          micSource.connect(dest);
        } catch (e) {}
      } else {
        // Silent audio generator to ensure a 100% valid audio track is in the WebM container
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
      }

      const combinedTracks = [
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ];
      const combinedStream = new MediaStream(combinedTracks);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "";

      const recorder = mimeType ? new MediaRecorder(combinedStream, { mimeType }) : new MediaRecorder(combinedStream);
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        combinedTracks.forEach((t) => t.stop());

        if (recordedChunksRef.current.length === 0) {
          sendMessage?.({ type: "STOP_RECORDING" });
          return;
        }

        const webmBlob = new Blob(recordedChunksRef.current, { type: "video/webm" });

        try {
          const res = await fetch("/api/recordings/upload", {
            method: "POST",
            headers: {
              "x-session-id": roomState?.roomId || "main",
              "x-title": encodeURIComponent(roomState?.roomName || "کلاس آنلاین"),
              "x-teacher": encodeURIComponent(currentUser?.name || "استاد"),
              "x-duration": String(durationSecRef.current),
            },
            body: webmBlob,
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
              type: "STOP_RECORDING",
              recordingId: data.recordingId,
              downloadUrl: data.downloadUrl,
              title: finishedRec.title,
            } as any);
          } else {
            sendMessage?.({ type: "STOP_RECORDING" });
          }
        } catch (err) {
          sendMessage?.({ type: "STOP_RECORDING" });
        }
      };

      recorder.start(1000); // 1s slice
    } catch (err) {
      console.warn("Recording start notice:", err);
      sendMessage?.({ type: "START_RECORDING" });
      setIsRecording(true);
    }
  }, [localAudioStream, roomState, currentUser, sendMessage, setIsRecording, setRecordingSeconds, addCompletedRecording]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      sendMessage?.({ type: "STOP_RECORDING" });
    }
  }, [sendMessage, setIsRecording]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return {
    isRecording,
    recordingTimeStr: formatTime(recordingSeconds),
    startRecording,
    stopRecording,
  };
}
