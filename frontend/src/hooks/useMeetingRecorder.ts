import { useRef, useEffect, useCallback } from "react";
import { useRoomStore } from "../stores/roomStore";
import { WSMessage } from "../types";

export function useMeetingRecorder(sendMessage?: (msg: WSMessage) => void) {
  const timerRef = useRef<number | null>(null);

  const {
    isRecording,
    recordingSeconds,
    setIsRecording,
    setRecordingSeconds,
  } = useRoomStore();

  useEffect(() => {
    if (isRecording) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds(useRoomStore.getState().recordingSeconds + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingSeconds(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, setRecordingSeconds]);

  // Requirement 7: Server-side recording without asking user/browser for any permissions!
  const startRecording = useCallback(() => {
    sendMessage?.({ type: "START_RECORDING" });
    setIsRecording(true);
    setRecordingSeconds(0);
  }, [sendMessage, setIsRecording, setRecordingSeconds]);

  const stopRecording = useCallback(() => {
    sendMessage?.({ type: "STOP_RECORDING" });
    setIsRecording(false);
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
