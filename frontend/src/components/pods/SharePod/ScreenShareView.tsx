import React, { useRef, useEffect } from "react";
import { Monitor, StopCircle, Maximize2, ShieldAlert } from "lucide-react";
import { useRoomStore } from "../../../stores/roomStore";

interface ScreenShareViewProps {
  onToggleScreen: () => void;
}

export const ScreenShareView: React.FC<ScreenShareViewProps> = ({ onToggleScreen }) => {
  const { localScreenStream, remoteStreams, isScreenSharing, userMediaStates, currentUser, roomState } = useRoomStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const canShare =
    currentUser?.role === "host" ||
    currentUser?.role === "presenter" ||
    currentUser?.permissions.canScreen;

  // Find active screen stream: either our local screen or remote stream with isScreenOn
  let activeStream: MediaStream | null = null;
  let activeSpeakerName = "";

  if (isScreenSharing && localScreenStream) {
    activeStream = localScreenStream;
    activeSpeakerName = `${currentUser?.name} (شما)`;
  } else {
    for (const [peerId, stream] of Object.entries(remoteStreams)) {
      const isPeerScreen = userMediaStates[peerId]?.isScreenOn;
      if (isPeerScreen && stream.getVideoTracks().length > 0) {
        activeStream = stream;
        activeSpeakerName = roomState?.users[peerId]?.name || "ارائه‌دهنده";
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
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 p-6 text-center text-adobe-muted select-none" dir="rtl">
        <Monitor className="w-12 h-12 mb-3 text-adobe-border opacity-70" />
        <h3 className="text-sm font-semibold text-adobe-text mb-1">
          در حال حاضر صفحه‌ای به اشتراک گذاشته نشده است
        </h3>
        <p className="text-xs max-w-sm mb-4">
          استاد یا ارائه‌دهنده می‌توانند صفحه نمایش، تب‌های مرورگر یا برنامه‌های دسکتاپ خود را به اشتراک بگذارند.
        </p>

        {canShare ? (
          <button
            onClick={onToggleScreen}
            className="px-4 py-2 rounded-md bg-adobe-accent hover:bg-blue-600 text-white text-xs font-semibold shadow-md transition flex items-center gap-2"
          >
            <Monitor className="w-4 h-4" />
            <span>اشتراک‌گذاری صفحه نمایش</span>
          </button>
        ) : (
          <span className="text-[11px] text-adobe-muted italic">
            در انتظار اشتراک‌گذاری صفحه توسط ارائه‌دهنده...
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
        muted={isScreenSharing}
        className="w-full h-full object-contain"
      />

      {/* Floating Toolbar on Hover */}
      <div className="absolute top-3 left-3 bg-black/75 backdrop-blur border border-adobe-border/60 px-3 py-1.5 rounded-lg flex items-center gap-3 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-1.5 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>اشتراک صفحه: {activeSpeakerName}</span>
        </div>

        {isScreenSharing && (
          <button
            onClick={onToggleScreen}
            className="flex items-center gap-1 bg-rose-600/80 hover:bg-rose-600 px-2 py-0.5 rounded text-[11px] font-semibold transition"
          >
            <StopCircle className="w-3.5 h-3.5" />
            <span>توقف اشتراک</span>
          </button>
        )}
      </div>
    </div>
  );
};
