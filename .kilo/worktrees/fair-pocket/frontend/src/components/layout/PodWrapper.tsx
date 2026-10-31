import React, { useState, useRef } from "react";
import {
  Maximize2,
  Minimize2,
  X,
  MoreHorizontal,
  Move,
  Users,
  MessageSquare,
  Share2,
  BarChart2,
  FileText,
} from "lucide-react";
import { PodConfig, WSMessage } from "../../types";
import { useRoomStore } from "../../stores/roomStore";

interface PodWrapperProps {
  pod: PodConfig;
  sendMessage: (msg: WSMessage) => void;
  children: React.ReactNode;
}

export const PodWrapper: React.FC<PodWrapperProps> = ({
  pod,
  sendMessage,
  children,
}) => {
  const { currentUser } = useRoomStore();
  const [isLocalMaximized, setIsLocalMaximized] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isHost = currentUser?.role === "host";

  // Dragging & Resizing state
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0, initialW: pod.w, initialH: pod.h, initialX: pod.x, initialY: pod.y });

  const getPodIcon = () => {
    switch (pod.type) {
      case "attendee":
        return <Users className="w-3.5 h-3.5 text-amber-400" />;
      case "chat":
        return <MessageSquare className="w-3.5 h-3.5 text-blue-400" />;
      case "share":
        return <Share2 className="w-3.5 h-3.5 text-emerald-400" />;
      case "poll":
        return <BarChart2 className="w-3.5 h-3.5 text-purple-400" />;
      case "notes":
        return <FileText className="w-3.5 h-3.5 text-yellow-300" />;
      default:
        return null;
    }
  };

  const handleMouseDownHeader = (e: React.MouseEvent) => {
    if (!isHost || isLocalMaximized) return;
    if ((e.target as HTMLElement).closest("button")) return;
    isDraggingRef.current = true;
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialX: pod.x,
      initialY: pod.y,
      initialW: pod.w,
      initialH: pod.h,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = ((moveEvent.clientX - startPosRef.current.x) / window.innerWidth) * 100;
      const dy = ((moveEvent.clientY - startPosRef.current.y) / window.innerHeight) * 100;

      const newX = Math.max(0, Math.min(100 - pod.w, startPosRef.current.initialX + dx));
      const newY = Math.max(0, Math.min(100 - pod.h, startPosRef.current.initialY + dy));

      pod.x = Math.round(newX);
      pod.y = Math.round(newY);
      useRoomStore.getState().updatePod({ ...pod });
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        sendMessage({ type: "UPDATE_POD", pod });
      }
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseDownResize = (e: React.MouseEvent) => {
    if (!isHost || isLocalMaximized) return;
    e.stopPropagation();
    isResizingRef.current = true;
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialX: pod.x,
      initialY: pod.y,
      initialW: pod.w,
      initialH: pod.h,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const dw = ((moveEvent.clientX - startPosRef.current.x) / window.innerWidth) * 100;
      const dh = ((moveEvent.clientY - startPosRef.current.y) / window.innerHeight) * 100;

      const newW = Math.max(15, Math.min(100 - pod.x, startPosRef.current.initialW + dw));
      const newH = Math.max(15, Math.min(100 - pod.y, startPosRef.current.initialH + dh));

      pod.w = Math.round(newW);
      pod.h = Math.round(newH);
      useRoomStore.getState().updatePod({ ...pod });
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        sendMessage({ type: "UPDATE_POD", pod });
      }
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const style: React.CSSProperties = isLocalMaximized
    ? {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 40,
      }
    : {
        position: "absolute",
        top: `${pod.y}%`,
        left: `${pod.x}%`,
        width: `${pod.w}%`,
        height: `${pod.h}%`,
        zIndex: 10,
      };

  return (
    <div
      style={style}
      className="p-1 transition-all duration-75 flex flex-col"
    >
      <div className="w-full h-full bg-adobe-pod border border-adobe-border rounded-md pod-shadow flex flex-col overflow-hidden">
        {/* Header Bar */}
        <div
          onMouseDown={handleMouseDownHeader}
          className={`h-7 bg-adobe-header border-b border-adobe-border px-2 flex items-center justify-between text-xs font-semibold ${
            isHost && !isLocalMaximized ? "cursor-move" : ""
          }`}
        >
          {/* Title & Icon */}
          <div className="flex items-center gap-1.5 truncate">
            {getPodIcon()}
            <span className="truncate text-adobe-text text-[11px] font-bold tracking-tight">
              {pod.title}
            </span>
          </div>

          {/* Pod Controls */}
          <div className="flex items-center gap-1 text-adobe-muted">
            <button
              onClick={() => setIsLocalMaximized(!isLocalMaximized)}
              title={isLocalMaximized ? "Restore Pod" : "Maximize Pod"}
              className="p-1 hover:text-white rounded hover:bg-adobe-border transition"
            >
              {isLocalMaximized ? (
                <Minimize2 className="w-3 h-3" />
              ) : (
                <Maximize2 className="w-3 h-3" />
              )}
            </button>

            {isHost && (
              <div className="relative">
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="p-1 hover:text-white rounded hover:bg-adobe-border transition"
                >
                  <MoreHorizontal className="w-3 h-3" />
                </button>
                {isMenuOpen && (
                  <div className="absolute right-0 mt-1 w-32 bg-adobe-bar border border-adobe-border rounded shadow-xl py-1 z-50 text-[11px]">
                    <button
                      onClick={() => {
                        const newTitle = prompt("Edit pod title:", pod.title);
                        if (newTitle) {
                          pod.title = newTitle;
                          sendMessage({ type: "UPDATE_POD", pod });
                        }
                        setIsMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1 hover:bg-adobe-pod"
                    >
                      Rename
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 relative overflow-hidden bg-adobe-pod/50 flex flex-col">
          {children}
        </div>

        {/* Resize Handle (Host only, bottom-right corner) */}
        {isHost && !isLocalMaximized && (
          <div
            onMouseDown={handleMouseDownResize}
            title="Resize Pod"
            className="absolute bottom-1 right-1 w-3 h-3 cursor-se-resize flex items-end justify-end p-0.5 text-adobe-muted hover:text-white"
          >
            <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-current"></div>
          </div>
        )}
      </div>
    </div>
  );
};
