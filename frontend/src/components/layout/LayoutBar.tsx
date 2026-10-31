import React from "react";
import { Monitor, MessageSquare, Users, Plus, Lock } from "lucide-react";
import { useRoomStore } from "../../stores/roomStore";
import { WSMessage } from "../../types";

interface LayoutBarProps {
  sendMessage: (msg: WSMessage) => void;
}

export const LayoutBar: React.FC<LayoutBarProps> = ({ sendMessage }) => {
  const { roomState, currentUser, prepareMode } = useRoomStore();

  const isHost = currentUser?.role === "host";
  const isPresenter = currentUser?.role === "presenter";
  const canSwitchLayout = isHost || isPresenter;

  const currentLayoutId = roomState?.activeLayoutId || "sharing";

  const handleSelectLayout = (layoutId: string) => {
    if (!canSwitchLayout) return;
    sendMessage({ type: "SWITCH_LAYOUT", layoutId });
  };

  const layouts = [
    { id: "sharing", label: "Sharing", icon: Monitor },
    { id: "discussion", label: "Discussion", icon: MessageSquare },
    { id: "collaboration", label: "Collaboration", icon: Users },
  ];

  return (
    <aside className="w-16 bg-adobe-bar border-l border-adobe-border flex flex-col items-center py-3 select-none z-30">
      <div className="text-[10px] uppercase font-bold text-adobe-muted tracking-wider mb-3">
        Layouts
      </div>

      <div className="flex flex-col gap-2 w-full px-2">
        {layouts.map((l) => {
          const Icon = l.icon;
          const isActive = currentLayoutId === l.id;
          return (
            <button
              key={l.id}
              onClick={() => handleSelectLayout(l.id)}
              disabled={!canSwitchLayout}
              title={
                !canSwitchLayout
                  ? "Only Host or Presenter can change layout"
                  : `Switch to ${l.label} layout`
              }
              className={`flex flex-col items-center justify-center p-2 rounded-lg border transition text-center ${
                isActive
                  ? "bg-adobe-pod border-adobe-accent text-white shadow-md ring-1 ring-adobe-accent"
                  : "border-transparent text-adobe-muted hover:bg-adobe-pod hover:text-adobe-text"
              } ${!canSwitchLayout ? "cursor-default opacity-80" : ""}`}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-[10px] leading-tight font-medium truncate w-full">
                {l.label}
              </span>
            </button>
          );
        })}

        {isHost && (
          <button
            onClick={() => {
              const name = prompt("Enter new custom layout name:", "Custom Layout");
              if (name && roomState) {
                const newLayout = {
                  id: `custom-${Date.now()}`,
                  name,
                  pods: [...roomState.currentLayout.pods],
                };
                sendMessage({ type: "UPDATE_LAYOUT", layout: newLayout });
              }
            }}
            title="Create New Custom Layout"
            className="flex flex-col items-center justify-center p-2 rounded-lg border border-dashed border-adobe-border text-adobe-muted hover:text-white hover:border-adobe-muted hover:bg-adobe-pod transition mt-2"
          >
            <Plus className="w-5 h-5 mb-1" />
            <span className="text-[10px] leading-tight font-medium">New</span>
          </button>
        )}
      </div>

      {!canSwitchLayout && (
        <div className="mt-auto flex flex-col items-center text-adobe-muted text-[10px] p-1 text-center">
          <Lock className="w-3.5 h-3.5 mb-1 opacity-60" />
          <span>Locked</span>
        </div>
      )}
    </aside>
  );
};
