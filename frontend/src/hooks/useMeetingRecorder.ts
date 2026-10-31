import { useRef, useEffect, useCallback } from "react";
import { useRoomStore } from "../stores/roomStore";
import { WSMessage } from "../types";

export function useMeetingRecorder(sendMessage?: (msg: WSMessage) => void) {
  const timerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const durationSecRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const {
    isRecording,
    recordingSeconds,
    localAudioStream,
    localCamStream,
    localScreenStream,
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

  const startRecording = useCallback(() => {
    try {
      sendMessage?.({ type: "START_RECORDING" });
      setIsRecording(true);
      setRecordingSeconds(0);
      durationSecRef.current = 0;

      // 1. Offscreen Dynamic Compositor (1280x720 16:9 HD canvas)
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");

      const startTime = Date.now();

      // Video elements to capture active webcam or screen share if present
      const camVideoEl = document.createElement("video");
      camVideoEl.autoplay = true;
      camVideoEl.muted = true;
      (camVideoEl as any).playsInline = true;

      const screenVideoEl = document.createElement("video");
      screenVideoEl.autoplay = true;
      screenVideoEl.muted = true;
      (screenVideoEl as any).playsInline = true;

      if (localCamStream && localCamStream.getVideoTracks().length > 0) {
        camVideoEl.srcObject = localCamStream;
      }
      if (localScreenStream && localScreenStream.getVideoTracks().length > 0) {
        screenVideoEl.srcObject = localScreenStream;
      }

      const drawFrame = () => {
        if (!ctx) return;
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        const m = Math.floor(elapsedSec / 60).toString().padStart(2, "0");
        const s = (elapsedSec % 60).toString().padStart(2, "0");

        // Background dark gradient
        const grad = ctx.createLinearGradient(0, 0, 1280, 720);
        grad.addColorStop(0, "#0b0f19");
        grad.addColorStop(1, "#1e293b");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1280, 720);

        // Check if there is active screen sharing
        if (localScreenStream && localScreenStream.getVideoTracks().length > 0 && screenVideoEl.videoWidth) {
          ctx.drawImage(screenVideoEl, 40, 60, 1200, 600);
        } else {
          // Classroom information banner
          ctx.fillStyle = "#38bdf8";
          ctx.font = "bold 36px 'Segoe UI', Tahoma, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(roomState?.roomName || "کلاس آنلاین Classroom", 640, 260);

          ctx.fillStyle = "#94a3b8";
          ctx.font = "22px 'Segoe UI', Tahoma, sans-serif";
          ctx.fillText(`استاد: ${currentUser?.name || "مدیر کلاس"}  •  سامانه آموزشی چابکان`, 640, 320);

          // If webcam is active, render webcam inset
          if (localCamStream && localCamStream.getVideoTracks().length > 0 && camVideoEl.videoWidth) {
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 4;
            ctx.strokeRect(460, 360, 360, 240);
            ctx.drawImage(camVideoEl, 460, 360, 360, 240);
          }
        }

        // Header Top Bar on Video
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(0, 0, 1280, 50);

        // REC Red Indicator & Timer
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(36, 25, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`REC ${m}:${s}`, 54, 31);

        ctx.font = "16px 'Segoe UI', Tahoma, sans-serif";
        ctx.textAlign = "right";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(roomState?.roomName || "Classroom", 1240, 31);

        animFrameRef.current = requestAnimationFrame(drawFrame);
      };

      drawFrame();

      const canvasStream = canvas.captureStream(15); // 15 FPS

      // 2. High-Compatibility Audio Mixing
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
      const dest = audioCtx.createMediaStreamDestination();

      if (localAudioStream && localAudioStream.getAudioTracks().length > 0) {
        try {
          const micSource = audioCtx.createMediaStreamSource(localAudioStream);
          micSource.connect(dest);
        } catch (e) {}
      } else {
        // Continuous inaudible clock signal (ensures WebM audio muxer writes a playable audio track)
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.value = 0.0001; // Inaudible
        osc.frequency.value = 100;
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
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
        }

        const duration = durationSecRef.current || Math.floor((Date.now() - startTime) / 1000);

        if (recordedChunksRef.current.length > 0) {
          const webmBlob = new Blob(recordedChunksRef.current, { type: "video/webm" });

          try {
            const res = await fetch("/api/recordings/upload", {
              method: "POST",
              headers: {
                "x-session-id": roomState?.roomId || "main",
                "x-title": encodeURIComponent(roomState?.roomName || "کلاس آنلاین"),
                "x-teacher": encodeURIComponent(currentUser?.name || "استاد"),
                "x-duration": String(duration),
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
              return;
            }
          } catch (err) {
            console.error("Recording upload error:", err);
          }
        }

        // Fallback to server-side generated recording
        sendMessage?.({ type: "STOP_RECORDING" });
      };

      recorder.start(1000);
    } catch (err) {
      console.warn("Recorder init error, using server fallback:", err);
      sendMessage?.({ type: "START_RECORDING" });
      setIsRecording(true);
    }
  }, [localAudioStream, localCamStream, localScreenStream, roomState, currentUser, sendMessage, setIsRecording, setRecordingSeconds, addCompletedRecording]);

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
