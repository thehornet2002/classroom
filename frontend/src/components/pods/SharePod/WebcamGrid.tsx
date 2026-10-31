import React, { useRef, useEffect } from "react";
import { Video, VideoOff, Mic, User as UserIcon } from "lucide-react";
import { useRoomStore } from "../../../stores/roomStore";

interface WebcamTileProps {
  stream: MediaStream;
  name: string;
  isMe?: boolean;
}

const WebcamTile: React.FC<WebcamTileProps> = ({ stream, name, isMe }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative bg-zinc-950 border border-adobe-border rounded-lg overflow-hidden flex items-center justify-center min-h-[140px]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMe}
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-1.5 left-1.5 bg-black/70 backdrop-blur px-2 py-0.5 rounded text-[11px] text-white font-medium flex items-center gap-1.5">
        <UserIcon className="w-3 h-3 text-adobe-muted" />
        <span>{name}</span>
        {isMe && <span className="text-[10px] text-adobe-muted">(شما)</span>}
      </div>
    </div>
  );
};

interface WebcamGridProps {
  onToggleCam: () => void;
}

export const WebcamGrid: React.FC<WebcamGridProps> = ({ onToggleCam }) => {
  const { localCamStream, remoteStreams, isCamOn, userMediaStates, currentUser, roomState } = useRoomStore();

  const canCam =
    currentUser?.role === "host" ||
    currentUser?.role === "presenter" ||
    currentUser?.permissions.canVideo;

  const tiles: { id: string; stream: MediaStream; name: string; isMe?: boolean }[] = [];

  // Local tile: ONLY if isCamOn is true and we have an active camera stream
  if (isCamOn && localCamStream && localCamStream.getVideoTracks().length > 0) {
    tiles.push({
      id: currentUser?.id || "local",
      stream: localCamStream,
      name: currentUser?.name || "شما",
      isMe: true,
    });
  }

  // Remote tiles: ONLY if remote peer has camera actively toggled on
  for (const [peerId, stream] of Object.entries(remoteStreams)) {
    const isPeerCam = userMediaStates[peerId]?.isCamOn;
    if (isPeerCam && stream.getVideoTracks().length > 0) {
      const name = roomState?.users[peerId]?.name || "شرکت‌کننده";
      tiles.push({
        id: peerId,
        stream,
        name,
        isMe: false,
      });
    }
  }

  if (tiles.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 p-6 text-center text-adobe-muted select-none" dir="rtl">
        <Video className="w-12 h-12 mb-3 text-adobe-border opacity-70" />
        <h3 className="text-sm font-semibold text-adobe-text mb-1">
          تصویر وبکمی فعال نیست
        </h3>
        <p className="text-xs max-w-sm mb-4">
          برای اشتراک‌گذاری تصویر خود، وبکم را روشن کنید.
        </p>
        {canCam ? (
          <button
            onClick={onToggleCam}
            className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition flex items-center gap-2"
          >
            <Video className="w-4 h-4" />
            <span>روشن کردن وبکم</span>
          </button>
        ) : (
          <span className="text-[11px] text-adobe-muted italic">
            در انتظار فعال‌سازی وبکم توسط استاد...
          </span>
        )}
      </div>
    );
  }

  const gridClass =
    tiles.length === 1
      ? "grid-cols-1"
      : tiles.length === 2
      ? "grid-cols-2"
      : tiles.length <= 4
      ? "grid-cols-2"
      : "grid-cols-3";

  return (
    <div className={`flex-1 p-2 grid ${gridClass} gap-2 bg-zinc-900 overflow-y-auto`}>
      {tiles.map((tile) => (
        <WebcamTile
          key={tile.id}
          stream={tile.stream}
          name={tile.name}
          isMe={tile.isMe}
        />
      ))}
    </div>
  );
};
