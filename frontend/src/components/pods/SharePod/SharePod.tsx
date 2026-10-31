import React from "react";
import { Monitor, Video, Edit3, FileText } from "lucide-react";
import { useRoomStore } from "../../../stores/roomStore";
import { ShareMode, WSMessage } from "../../../types";
import { ScreenShareView } from "./ScreenShareView";
import { WebcamGrid } from "./WebcamGrid";
import { WhiteboardCanvas } from "./WhiteboardCanvas";
import { DocumentViewer } from "./DocumentViewer";

interface SharePodProps {
  sendMessage: (msg: WSMessage) => void;
  onToggleScreen: () => void;
  onToggleCam: () => void;
}

export const SharePod: React.FC<SharePodProps> = ({
  sendMessage,
  onToggleScreen,
  onToggleCam,
}) => {
  const { roomState, currentUser } = useRoomStore();
  const currentMode = roomState?.shareMode || "screen";

  const isPresenterOrHost =
    currentUser?.role === "host" || currentUser?.role === "presenter";

  const handleSelectMode = (mode: ShareMode) => {
    if (!isPresenterOrHost) return;
    sendMessage({ type: "SET_SHARE_MODE", mode });
    useRoomStore.getState().setShareMode(mode);
  };

  const tabs: { mode: ShareMode; label: string; icon: React.FC<{ className?: string }> }[] = [
    { mode: "screen", label: "Screen", icon: Monitor },
    { mode: "camera", label: "Video", icon: Video },
    { mode: "whiteboard", label: "Whiteboard", icon: Edit3 },
    { mode: "document", label: "Document", icon: FileText },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Share Sub-Bar Mode Selector */}
      {isPresenterOrHost && (
        <div className="h-7 bg-adobe-bar border-b border-adobe-border px-2 flex items-center justify-between text-[11px] select-none">
          <div className="flex items-center gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentMode === tab.mode;
              return (
                <button
                  key={tab.mode}
                  onClick={() => handleSelectMode(tab.mode)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded transition font-medium ${
                    isActive
                      ? "bg-adobe-pod text-white border border-adobe-border"
                      : "text-adobe-muted hover:text-white"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <span className="text-[10px] text-adobe-muted">
            Mode: <strong className="text-white capitalize">{currentMode}</strong>
          </span>
        </div>
      )}

      {/* Active Mode View */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {currentMode === "screen" && (
          <ScreenShareView onToggleScreen={onToggleScreen} />
        )}
        {currentMode === "camera" && (
          <WebcamGrid onToggleCam={onToggleCam} />
        )}
        {currentMode === "whiteboard" && (
          <WhiteboardCanvas sendMessage={sendMessage} />
        )}
        {currentMode === "document" && (
          <DocumentViewer sendMessage={sendMessage} />
        )}
      </div>
    </div>
  );
};
