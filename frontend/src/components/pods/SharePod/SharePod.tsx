import React from "react";
import { Monitor, Edit3, FileText, AlertTriangle } from "lucide-react";
import { useRoomStore } from "../../../stores/roomStore";
import { ShareMode, WSMessage } from "../../../types";
import { ScreenShareView } from "./ScreenShareView";
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
}) => {
  const { roomState, currentUser, isScreenSharing } = useRoomStore();
  const currentMode = roomState?.shareMode || "screen";

  const isPresenterOrHost =
    currentUser?.role === "host" || currentUser?.role === "presenter";

  const handleSelectMode = (mode: ShareMode) => {
    if (!isPresenterOrHost) return;

    // Requirement 3: If screen share is active, do not allow switching to whiteboard/document without stopping screen share first!
    if (isScreenSharing && mode !== "screen") {
      const confirmStop = confirm(
        "اشتراک صفحه نمایش در حال اجراست. برای رفتن به این بخش، ابتدا اشتراک صفحه قطع می‌شود. آیا ادامه می‌دهید؟"
      );
      if (!confirmStop) return;
      onToggleScreen(); // Stop screen sharing first!
    }

    sendMessage({ type: "SET_SHARE_MODE", mode });
    useRoomStore.getState().setShareMode(mode);
  };

  // Requirement 1: Webcam is completely separated from the center share pod!
  const tabs: { mode: ShareMode; label: string; icon: React.FC<{ className?: string }> }[] = [
    { mode: "screen", label: "اشتراک صفحه", icon: Monitor },
    { mode: "whiteboard", label: "تخته سفید", icon: Edit3 },
    { mode: "document", label: "ارائه اسناد و جزوه", icon: FileText },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" dir="rtl">
      {/* Share Sub-Bar Mode Selector */}
      {isPresenterOrHost && (
        <div className="h-8 bg-adobe-bar border-b border-adobe-border px-2.5 flex items-center justify-between text-xs select-none">
          <div className="flex items-center gap-1.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentMode === tab.mode;
              const isLockedByScreen = isScreenSharing && tab.mode !== "screen";

              return (
                <button
                  key={tab.mode}
                  onClick={() => handleSelectMode(tab.mode)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition font-semibold text-[11px] ${
                    isActive
                      ? "bg-adobe-accent text-white shadow-sm"
                      : isLockedByScreen
                      ? "text-adobe-muted/50 hover:text-adobe-muted"
                      : "text-adobe-muted hover:text-white hover:bg-adobe-border/60"
                  }`}
                  title={isLockedByScreen ? "ابتدا اشتراک صفحه را متوقف کنید" : ""}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {isScreenSharing && currentMode === "screen" && (
            <div className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>اشتراک صفحه زنده است</span>
            </div>
          )}
        </div>
      )}

      {/* Active Mode View */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {currentMode === "screen" && (
          <ScreenShareView onToggleScreen={onToggleScreen} />
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
