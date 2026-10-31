import React, { useRef, useEffect } from "react";
import { Monitor, StopCircle, Maximize2, ShieldAlert } from "lucide-react";
import { useRoomStore } from "../../../stores/roomStore";

interface ScreenShareViewProps {
  onToggleScreen: () => void;
}

export const ScreenShareView: React.FC<ScreenShareViewProps> = ({ onToggleScreen }) => {
  const { localStream, remoteStreams, isScreenSharing, currentUser } = useRoomStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const canShare =
    currentUser?.role === "host" ||
    currentUser?.role === "presenter" ||
    currentUser?.permissions.canScreen;

  // Find active stream: either our local screen or the first remote stream that has video tracks
  let activeStream: MediaStream | null = null;
  let activeSpeakerName = "";

  if (isScreenSharing && localStream) {
    activeStream = localStream;
    activeSpeakerName = `${currentUser?.name} (You)`;
  } else {
    for (const [peerId, stream] of Object.entries(remoteStreams)) {
      if (stream.getVideoTracks().length > 0) {
        activeStream = stream;
        activeSpeakerName = useRoomStore.getState().roomState?.users[peerId]?.name || "Presenter";
        break;
      }
    }
  }

  useEffect(() => {
    if (videoRef.current && activeStream) {
      videoRef.current.srcObject = activeStream;
    }
  }, [activeStream]);

  if (!activeStream) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 p-6 text-center text-adobe-muted select-none">
        <Monitor className="w-12 h-12 mb-3 text-adobe-border opacity-70" />
        <h3 className="text-sm font-semibold text-adobe-text mb-1">
          Nothing is currently being shared
        </h3>
        <p className="text-xs max-w-sm mb-4">
          Hosts and presenters can share their full screen, application windows, or browser tabs with participants.
        </p>

        {canShare ? (
          <button
            onClick={onToggleScreen}
            className="px-4 py-2 rounded-md bg-adobe-accent hover:bg-blue-600 text-white text-xs font-semibold shadow-md transition flex items-center gap-2"
          >
            <Monitor className="w-4 h-4" />
            <span>Share My Screen</span>
          </button>
        ) : (
          <span className="text-[11px] text-adobe-muted italic">
            Waiting for a presenter to start sharing...
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-black relative overflow-hidden group select-none">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isScreenSharing} // Mute local preview to avoid feedback loop
        className="w-full h-full object-contain"
      />

      {/* Floating Info Overlay */}
      <div className="absolute top-2 left-2 bg-adobe-bar/80 backdrop-blur border border-adobe-border px-2.5 py-1 rounded text-xs text-white flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-semibold">{activeSpeakerName}'s Screen</span>
      </div>

      {isScreenSharing && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-adobe-bar/90 backdrop-blur border border-rose-800 px-3 py-1.5 rounded-full flex items-center gap-2 shadow-2xl">
          <span className="text-xs text-rose-300 font-medium">Sharing active</span>
          <button
            onClick={onToggleScreen}
            className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white text-xs px-2.5 py-0.5 rounded-full font-semibold transition"
          >
            <StopCircle className="w-3.5 h-3.5" />
            <span>Stop Sharing</span>
          </button>
        </div>
      )}
    </div>
  );
};
