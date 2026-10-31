import React, { useState } from "react";
import { Layers, X, Play, StopCircle, Radio, Users } from "lucide-react";
import { useRoomStore } from "../../stores/roomStore";
import { BreakoutRoom, WSMessage } from "../../types";

interface BreakoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  sendMessage: (msg: WSMessage) => void;
}

export const BreakoutModal: React.FC<BreakoutModalProps> = ({
  isOpen,
  onClose,
  sendMessage,
}) => {
  const { roomState } = useRoomStore();
  const [numRooms, setNumRooms] = useState(2);
  const [broadcastText, setBroadcastText] = useState("");

  if (!isOpen) return null;

  const users = Object.values(roomState?.users || {}).filter(
    (u) => u.admitted && u.role === "participant"
  );
  const isBreakoutsActive = roomState?.breakoutsActive || false;

  const handleStartBreakouts = () => {
    // Distribute participants evenly across breakout rooms
    const rooms: BreakoutRoom[] = [];
    for (let i = 1; i <= numRooms; i++) {
      rooms.push({
        id: `breakout-${i}`,
        name: `Breakout Room ${i}`,
        assignedUserIds: [],
      });
    }

    users.forEach((u, idx) => {
      const roomIndex = idx % numRooms;
      rooms[roomIndex].assignedUserIds.push(u.id);
    });

    sendMessage({ type: "BREAKOUT_START", rooms });
  };

  const handleEndBreakouts = () => {
    sendMessage({ type: "BREAKOUT_END" });
  };

  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    sendMessage({ type: "BREAKOUT_BROADCAST", text: broadcastText.trim() });
    setBroadcastText("");
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-adobe-pod border border-adobe-border rounded-lg shadow-2xl overflow-hidden flex flex-col text-xs">
        {/* Header */}
        <div className="h-9 bg-adobe-header border-b border-adobe-border px-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-white">
            <Layers className="w-4 h-4 text-adobe-accent" />
            <span>Breakout Rooms Management</span>
          </div>
          <button onClick={onClose} className="text-adobe-muted hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {isBreakoutsActive ? (
            <div className="space-y-3">
              <div className="p-3 rounded-md bg-emerald-950/50 border border-emerald-800 text-emerald-200 flex items-center justify-between">
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Breakout Sessions are in progress
                  </div>
                  <span className="text-[11px] text-emerald-300/80">
                    {roomState?.breakoutRooms.length} active breakout rooms
                  </span>
                </div>
                <button
                  onClick={handleEndBreakouts}
                  className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 font-semibold text-white flex items-center gap-1.5 shadow"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>End All</span>
                </button>
              </div>

              {/* Broadcast message form */}
              <form onSubmit={handleSendBroadcast} className="space-y-1.5">
                <label className="block text-[11px] text-adobe-muted font-medium">
                  Broadcast Message to All Breakout Rooms:
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={broadcastText}
                    onChange={(e) => setBroadcastText(e.target.value)}
                    placeholder="e.g. 2 minutes remaining..."
                    className="flex-1 bg-adobe-bar border border-adobe-border rounded px-2.5 py-1.5 text-white placeholder-adobe-muted focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-adobe-accent hover:bg-blue-600 text-white rounded font-medium flex items-center gap-1"
                  >
                    <Radio className="w-3 h-3" />
                    <span>Send</span>
                  </button>
                </div>
              </form>

              {/* Room assignments overview */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {roomState?.breakoutRooms.map((br) => (
                  <div key={br.id} className="bg-adobe-bar/60 p-2 rounded border border-adobe-border">
                    <div className="font-bold text-white mb-1">{br.name}</div>
                    <div className="text-[11px] text-adobe-muted">
                      {br.assignedUserIds.length === 0
                        ? "No participants"
                        : br.assignedUserIds
                            .map((id) => roomState.users[id]?.name || "User")
                            .join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-adobe-muted mb-1 font-medium">
                  Number of Breakout Rooms:
                </label>
                <select
                  value={numRooms}
                  onChange={(e) => setNumRooms(Number(e.target.value))}
                  className="w-full bg-adobe-bar border border-adobe-border rounded px-2.5 py-1.5 text-white"
                >
                  <option value={2}>2 Rooms</option>
                  <option value={3}>3 Rooms</option>
                  <option value={4}>4 Rooms</option>
                  <option value={5}>5 Rooms</option>
                </select>
              </div>

              <div className="bg-adobe-bar/60 p-3 rounded border border-adobe-border text-[11px] text-adobe-muted flex items-center gap-2">
                <Users className="w-4 h-4 text-adobe-accent" />
                <span>
                  {users.length} {users.length === 1 ? "participant will be" : "participants will be"} evenly distributed.
                </span>
              </div>

              <button
                onClick={handleStartBreakouts}
                className="w-full py-2 bg-adobe-accent hover:bg-blue-600 text-white font-bold rounded shadow-md transition flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Start Breakout Sessions</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
