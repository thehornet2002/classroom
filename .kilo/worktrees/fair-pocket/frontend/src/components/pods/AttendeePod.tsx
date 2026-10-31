import React, { useState } from "react";
import {
  Crown,
  Presentation,
  User as UserIcon,
  Hand,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Edit3,
  MessageSquare,
  MoreVertical,
  Check,
  X,
  UserX,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { useRoomStore } from "../../stores/roomStore";
import { User, UserRole, WSMessage } from "../../types";

interface AttendeePodProps {
  sendMessage: (msg: WSMessage) => void;
}

export const AttendeePod: React.FC<AttendeePodProps> = ({ sendMessage }) => {
  const { roomState, currentUser } = useRoomStore();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [expandedGroups, setExpandedGroups] = useState({
    hosts: true,
    presenters: true,
    participants: true,
  });

  const isHost = currentUser?.role === "host";
  const users = Object.values(roomState?.users || {});

  const hosts = users.filter((u) => u.role === "host" && u.admitted);
  const presenters = users.filter((u) => u.role === "presenter" && u.admitted);
  const participants = users.filter((u) => u.role === "participant" && u.admitted);
  const pendingAdmission = users.filter((u) => !u.admitted);
  const raisedHands = users.filter((u) => u.status === "raised_hand");

  const toggleGroup = (key: "hosts" | "presenters" | "participants") => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSetRole = (targetId: string, role: UserRole) => {
    sendMessage({ type: "SET_ROLE", targetId, role });
    setSelectedUser(null);
  };

  const handleTogglePermission = (
    targetId: string,
    key: "canAudio" | "canVideo" | "canDraw" | "canChat",
    currentVal: boolean
  ) => {
    sendMessage({
      type: "SET_PERMISSIONS",
      targetId,
      permissions: { [key]: !currentVal },
    });
  };

  const handleKick = (targetId: string) => {
    if (confirm("Are you sure you want to remove this user from the room?")) {
      sendMessage({ type: "KICK_USER", targetId, reason: "Removed by Host" });
      setSelectedUser(null);
    }
  };

  const handleAdmissionDecision = (targetId: string, approved: boolean) => {
    sendMessage({ type: "ADMISSION_DECISION", targetId, approved });
  };

  const renderStatusBadge = (user: User) => {
    switch (user.status) {
      case "raised_hand":
        return (
          <span className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] animate-bounce">
            <Hand className="w-3 h-3 fill-amber-400" />
            <span>Hand</span>
          </span>
        );
      case "agree":
        return <ThumbsUp className="w-3 h-3 text-emerald-400" />;
      case "disagree":
        return <ThumbsDown className="w-3 h-3 text-rose-400" />;
      case "away":
        return <Clock className="w-3 h-3 text-zinc-400" />;
      default:
        return null;
    }
  };

  const renderUserItem = (user: User) => {
    const isMe = user.id === currentUser?.id;
    return (
      <div
        key={user.id}
        className={`group flex items-center justify-between px-2 py-1.5 hover:bg-adobe-border/50 text-xs transition ${
          isMe ? "font-semibold text-white bg-adobe-border/20" : "text-adobe-text"
        }`}
      >
        <div className="flex items-center gap-1.5 truncate flex-1">
          {user.role === "host" && <Crown className="w-3.5 h-3.5 text-adobe-host flex-shrink-0" />}
          {user.role === "presenter" && (
            <Presentation className="w-3.5 h-3.5 text-adobe-presenter flex-shrink-0" />
          )}
          {user.role === "participant" && (
            <UserIcon className="w-3.5 h-3.5 text-adobe-participant flex-shrink-0" />
          )}

          <span className="truncate">{user.name}</span>
          {isMe && <span className="text-[10px] text-adobe-muted">(You)</span>}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {renderStatusBadge(user)}

          {/* Media permission badges */}
          <div className="flex items-center gap-1 text-adobe-muted">
            {user.permissions.canAudio && (
              <span title="Audio rights enabled">
                <Mic className="w-3 h-3 text-emerald-400" />
              </span>
            )}
            {user.permissions.canVideo && (
              <span title="Video rights enabled">
                <Video className="w-3 h-3 text-emerald-400" />
              </span>
            )}
            {user.permissions.canDraw && (
              <span title="Drawing rights enabled">
                <Edit3 className="w-3 h-3 text-blue-400" />
              </span>
            )}
          </div>

          {/* Host actions menu toggle */}
          {isHost && !isMe && (
            <button
              onClick={() => setSelectedUser(selectedUser?.id === user.id ? null : user)}
              className="p-1 hover:text-white rounded hover:bg-adobe-border"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden text-xs">
      {/* Hand Raise Banner if anyone raised hands */}
      {raisedHands.length > 0 && (
        <div className="bg-amber-950/70 border-b border-amber-800/80 px-2.5 py-1.5 flex items-center justify-between text-amber-200">
          <div className="flex items-center gap-1.5 font-medium">
            <Hand className="w-3.5 h-3.5 fill-amber-400 text-amber-400 animate-pulse" />
            <span>
              {raisedHands.length} {raisedHands.length === 1 ? "person has" : "people have"} raised hand
            </span>
          </div>
          {isHost && (
            <button
              onClick={() => {
                raisedHands.forEach((u) => {
                  sendMessage({ type: "STATUS_CHANGE", status: "none", targetId: u.id });
                });
              }}
              className="text-[10px] underline hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Pending Admission Waiting Room (Visible only to Host) */}
      {isHost && pendingAdmission.length > 0 && (
        <div className="bg-blue-950/80 border-b border-blue-800 p-2 text-blue-200 flex flex-col gap-1.5">
          <div className="flex items-center justify-between font-bold text-[11px]">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              Waiting Room ({pendingAdmission.length})
            </span>
          </div>
          <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
            {pendingAdmission.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between bg-blue-900/40 px-2 py-1 rounded"
              >
                <span className="truncate font-medium">{user.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleAdmissionDecision(user.id, true)}
                    className="p-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
                    title="Admit user"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleAdmissionDecision(user.id, false)}
                    className="p-1 rounded bg-rose-700 hover:bg-rose-600 text-white"
                    title="Deny admission"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Groups List */}
      <div className="flex-1 overflow-y-auto p-1 divide-y divide-adobe-border/40">
        {/* Hosts Group */}
        <div>
          <button
            onClick={() => toggleGroup("hosts")}
            className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-bold text-adobe-muted uppercase hover:text-white"
          >
            <div className="flex items-center gap-1">
              {expandedGroups.hosts ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <Crown className="w-3 h-3 text-adobe-host" />
              <span>Hosts ({hosts.length})</span>
            </div>
          </button>
          {expandedGroups.hosts && hosts.map(renderUserItem)}
        </div>

        {/* Presenters Group */}
        <div>
          <button
            onClick={() => toggleGroup("presenters")}
            className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-bold text-adobe-muted uppercase hover:text-white"
          >
            <div className="flex items-center gap-1">
              {expandedGroups.presenters ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <Presentation className="w-3 h-3 text-adobe-presenter" />
              <span>Presenters ({presenters.length})</span>
            </div>
          </button>
          {expandedGroups.presenters && presenters.map(renderUserItem)}
        </div>

        {/* Participants Group */}
        <div>
          <button
            onClick={() => toggleGroup("participants")}
            className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-bold text-adobe-muted uppercase hover:text-white"
          >
            <div className="flex items-center gap-1">
              {expandedGroups.participants ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <UserIcon className="w-3 h-3 text-adobe-participant" />
              <span>Participants ({participants.length})</span>
            </div>
          </button>
          {expandedGroups.participants && participants.map(renderUserItem)}
        </div>
      </div>

      {/* Host User Action Modal/Flyout */}
      {selectedUser && (
        <div className="border-t border-adobe-border bg-adobe-bar p-2 flex flex-col gap-2">
          <div className="flex items-center justify-between font-bold text-adobe-text">
            <span>Manage: {selectedUser.name}</span>
            <button
              onClick={() => setSelectedUser(null)}
              className="text-adobe-muted hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Role Change buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleSetRole(selectedUser.id, "host")}
              className={`flex-1 py-1 rounded text-[10px] font-semibold border ${
                selectedUser.role === "host"
                  ? "bg-adobe-host/20 border-adobe-host text-adobe-host"
                  : "border-adobe-border hover:bg-adobe-pod"
              }`}
            >
              Host
            </button>
            <button
              onClick={() => handleSetRole(selectedUser.id, "presenter")}
              className={`flex-1 py-1 rounded text-[10px] font-semibold border ${
                selectedUser.role === "presenter"
                  ? "bg-adobe-presenter/20 border-adobe-presenter text-adobe-presenter"
                  : "border-adobe-border hover:bg-adobe-pod"
              }`}
            >
              Presenter
            </button>
            <button
              onClick={() => handleSetRole(selectedUser.id, "participant")}
              className={`flex-1 py-1 rounded text-[10px] font-semibold border ${
                selectedUser.role === "participant"
                  ? "bg-adobe-participant/20 border-adobe-participant text-adobe-participant"
                  : "border-adobe-border hover:bg-adobe-pod"
              }`}
            >
              Participant
            </button>
          </div>

          {/* Individual Permission Toggles */}
          <div className="grid grid-cols-2 gap-1 text-[11px]">
            <button
              onClick={() =>
                handleTogglePermission(
                  selectedUser.id,
                  "canAudio",
                  selectedUser.permissions.canAudio
                )
              }
              className={`flex items-center justify-between p-1.5 rounded border ${
                selectedUser.permissions.canAudio
                  ? "border-emerald-600 bg-emerald-950/40 text-emerald-300"
                  : "border-adobe-border text-adobe-muted"
              }`}
            >
              <span>Microphone</span>
              {selectedUser.permissions.canAudio ? (
                <Mic className="w-3 h-3 text-emerald-400" />
              ) : (
                <MicOff className="w-3 h-3" />
              )}
            </button>

            <button
              onClick={() =>
                handleTogglePermission(
                  selectedUser.id,
                  "canVideo",
                  selectedUser.permissions.canVideo
                )
              }
              className={`flex items-center justify-between p-1.5 rounded border ${
                selectedUser.permissions.canVideo
                  ? "border-emerald-600 bg-emerald-950/40 text-emerald-300"
                  : "border-adobe-border text-adobe-muted"
              }`}
            >
              <span>Webcam</span>
              {selectedUser.permissions.canVideo ? (
                <Video className="w-3 h-3 text-emerald-400" />
              ) : (
                <VideoOff className="w-3 h-3" />
              )}
            </button>

            <button
              onClick={() =>
                handleTogglePermission(
                  selectedUser.id,
                  "canDraw",
                  selectedUser.permissions.canDraw
                )
              }
              className={`flex items-center justify-between p-1.5 rounded border ${
                selectedUser.permissions.canDraw
                  ? "border-blue-600 bg-blue-950/40 text-blue-300"
                  : "border-adobe-border text-adobe-muted"
              }`}
            >
              <span>Whiteboard</span>
              <Edit3 className="w-3 h-3" />
            </button>

            <button
              onClick={() => handleKick(selectedUser.id)}
              className="flex items-center justify-between p-1.5 rounded border border-rose-900 bg-rose-950/40 text-rose-300 hover:bg-rose-900"
            >
              <span>Kick User</span>
              <UserX className="w-3 h-3 text-rose-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
