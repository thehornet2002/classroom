import React, { useState } from "react";
import { LogIn, Crown, User as UserIcon, Server, Shield, Sparkles } from "lucide-react";
import { UserRole } from "../../types";

interface EntryDialogProps {
  onJoin: (params: {
    workerUrl: string;
    roomId: string;
    name: string;
    role: UserRole;
    pass: string;
  }) => void;
}

export const EntryDialog: React.FC<EntryDialogProps> = ({ onJoin }) => {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("main");
  const [role, setRole] = useState<UserRole>("participant");
  const [pass, setPass] = useState("");
  const [workerUrl, setWorkerUrl] = useState(() => {
    // Detect environment default
    if (window.location.protocol === "https:") {
      return `wss://${window.location.host}/ws`;
    }
    return `ws://localhost:8787/ws`;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onJoin({
      workerUrl: workerUrl.trim(),
      roomId: roomId.trim() || "main",
      name: name.trim(),
      role,
      pass: pass.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-adobe-bg/95 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none">
      <div className="w-full max-w-md bg-adobe-pod border border-adobe-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-6 text-white text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-yellow-300" />
            <h1 className="text-xl font-bold tracking-tight">ClassroomFlare</h1>
          </div>
          <p className="text-xs text-blue-100">
            Adobe Connect Serverless on Cloudflare Workers
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Display Name */}
          <div>
            <label className="block text-adobe-muted font-semibold mb-1 text-[11px]">
              Your Display Name:
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe / Ali Rezaei"
              className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white placeholder-adobe-muted focus:outline-none focus:border-adobe-accent text-xs"
            />
          </div>

          {/* Room Name */}
          <div>
            <label className="block text-adobe-muted font-semibold mb-1 text-[11px]">
              Room ID:
            </label>
            <input
              type="text"
              required
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="main"
              className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-adobe-accent text-xs"
            />
          </div>

          {/* Role selector */}
          <div>
            <label className="block text-adobe-muted font-semibold mb-1 text-[11px]">
              Join As:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole("participant")}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg border font-semibold transition ${
                  role === "participant"
                    ? "bg-adobe-participant/20 border-adobe-participant text-white"
                    : "border-adobe-border text-adobe-muted hover:bg-adobe-bar"
                }`}
              >
                <UserIcon className="w-4 h-4 text-adobe-participant" />
                <span>Guest / Student</span>
              </button>

              <button
                type="button"
                onClick={() => setRole("host")}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg border font-semibold transition ${
                  role === "host"
                    ? "bg-adobe-host/20 border-adobe-host text-white"
                    : "border-adobe-border text-adobe-muted hover:bg-adobe-bar"
                }`}
              >
                <Crown className="w-4 h-4 text-adobe-host" />
                <span>Host (Teacher)</span>
              </button>
            </div>
          </div>

          {/* Host Passcode */}
          {role === "host" && (
            <div>
              <label className="block text-adobe-muted font-semibold mb-1 text-[11px] flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-adobe-host" />
                <span>Host Passcode (optional if room is new):</span>
              </label>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Enter room host password"
                className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-adobe-accent text-xs"
              />
            </div>
          )}

          {/* Advanced Worker URL Toggle */}
          <details className="text-[11px] text-adobe-muted">
            <summary className="cursor-pointer hover:text-white flex items-center gap-1 font-semibold">
              <Server className="w-3 h-3" />
              <span>Cloudflare Worker URL Settings</span>
            </summary>
            <div className="mt-2">
              <input
                type="text"
                value={workerUrl}
                onChange={(e) => setWorkerUrl(e.target.value)}
                className="w-full bg-adobe-bar border border-adobe-border rounded px-2.5 py-1.5 text-white font-mono text-[10px]"
              />
            </div>
          </details>

          {/* Submit */}
          <button
            type="submit"
            className="w-full py-2.5 bg-adobe-accent hover:bg-blue-600 text-white font-bold rounded-lg shadow-lg transition flex items-center justify-center gap-2 mt-2"
          >
            <LogIn className="w-4 h-4" />
            <span>Enter Room</span>
          </button>
        </form>
      </div>
    </div>
  );
};
