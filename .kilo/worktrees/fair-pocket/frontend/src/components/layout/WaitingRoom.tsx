import React from "react";
import { Loader2, ShieldAlert, LogOut } from "lucide-react";
import { useRoomStore } from "../../stores/roomStore";

export const WaitingRoom: React.FC = () => {
  const { admissionMessage, roomState } = useRoomStore();

  return (
    <div className="fixed inset-0 bg-adobe-bg/95 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none">
      <div className="w-full max-w-sm bg-adobe-pod border border-adobe-border rounded-xl shadow-2xl p-6 text-center text-xs flex flex-col items-center">
        <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-3">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>

        <h3 className="text-base font-bold text-white mb-1">Waiting for Host Admission</h3>
        <p className="text-adobe-muted text-xs mb-4 max-w-xs">
          {admissionMessage || "The host has been notified of your arrival. Please wait while they review and admit you to the room."}
        </p>

        <div className="w-full p-2.5 rounded-lg bg-adobe-bar/60 border border-adobe-border mb-4 text-[11px] text-adobe-muted">
          <span>Room: <strong className="text-white">{roomState?.roomName || "Adobe Connect Room"}</strong></span>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-adobe-bar border border-adobe-border text-adobe-muted hover:text-white hover:bg-adobe-border text-xs transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Cancel & Leave</span>
        </button>
      </div>
    </div>
  );
};
