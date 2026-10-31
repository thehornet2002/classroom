import React, { useState, useRef, useEffect } from "react";
import { Send, User as UserIcon, MessageSquare, Plus, Lock } from "lucide-react";
import { useRoomStore } from "../../stores/roomStore";
import { WSMessage } from "../../types";

interface ChatPodProps {
  sendMessage: (msg: WSMessage) => void;
}

export const ChatPod: React.FC<ChatPodProps> = ({ sendMessage }) => {
  const {
    chatMessages,
    activeChannel,
    setActiveChannel,
    unreadCount,
    currentUser,
    roomState,
  } = useRoomStore();

  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isHostOrPresenter =
    currentUser?.role === "host" || currentUser?.role === "presenter";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, activeChannel]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !currentUser) return;

    if (!currentUser.permissions.canChat) {
      alert("Chat rights are disabled for you.");
      return;
    }

    const newMsg = {
      type: "CHAT_MESSAGE" as const,
      id: crypto.randomUUID(),
      channel: activeChannel,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderRole: currentUser.role,
      text: inputText.trim(),
      timestamp: Date.now(),
    };

    sendMessage(newMsg);
    setInputText("");
  };

  // Filter messages for current channel
  const filteredMessages = chatMessages.filter((msg) => {
    if (activeChannel === "everyone") {
      return msg.channel === "everyone";
    }
    if (activeChannel === "hosts") {
      return msg.channel === "hosts";
    }
    // Private chat: either sent to me by target or sent by me to target
    return (
      (msg.channel === activeChannel && msg.senderId === currentUser?.id) ||
      (msg.channel === currentUser?.id && msg.senderId === activeChannel)
    );
  });

  const getRoleColor = (role: string) => {
    switch (role) {
      case "host":
        return "text-adobe-host";
      case "presenter":
        return "text-adobe-presenter";
      default:
        return "text-adobe-participant";
    }
  };

  // List of other users for private chat
  const otherUsers = Object.values(roomState?.users || {}).filter(
    (u) => u.id !== currentUser?.id && u.admitted
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden text-xs">
      {/* Channels Tab Bar */}
      <div className="flex items-center bg-adobe-bar border-b border-adobe-border px-1 overflow-x-auto select-none">
        {/* Everyone Tab */}
        <button
          onClick={() => setActiveChannel("everyone")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 border-b-2 font-medium transition text-[11px] ${
            activeChannel === "everyone"
              ? "border-adobe-accent text-white bg-adobe-pod/50"
              : "border-transparent text-adobe-muted hover:text-adobe-text"
          }`}
        >
          <span>Everyone</span>
          {(unreadCount["everyone"] || 0) > 0 && (
            <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] flex items-center justify-center font-bold">
              {unreadCount["everyone"]}
            </span>
          )}
        </button>

        {/* Hosts & Presenters Tab */}
        {isHostOrPresenter && (
          <button
            onClick={() => setActiveChannel("hosts")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 border-b-2 font-medium transition text-[11px] ${
              activeChannel === "hosts"
                ? "border-adobe-host text-adobe-host bg-adobe-pod/50"
                : "border-transparent text-adobe-muted hover:text-adobe-text"
            }`}
          >
            <Lock className="w-3 h-3" />
            <span>Hosts</span>
            {(unreadCount["hosts"] || 0) > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-black text-[9px] flex items-center justify-center font-bold">
                {unreadCount["hosts"]}
              </span>
            )}
          </button>
        )}

        {/* Active Private 1-to-1 Chat Tab if selected */}
        {activeChannel !== "everyone" && activeChannel !== "hosts" && (
          <div className="flex items-center border-b-2 border-adobe-accent text-white bg-adobe-pod/50 px-2 py-1 text-[11px]">
            <span>
              {roomState?.users[activeChannel]?.name || "Private Chat"}
            </span>
            <button
              onClick={() => setActiveChannel("everyone")}
              className="ml-1 text-adobe-muted hover:text-white"
            >
              ×
            </button>
          </div>
        )}

        {/* Private Chat Picker */}
        {otherUsers.length > 0 && (
          <div className="ml-auto pl-1">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) setActiveChannel(e.target.value);
              }}
              className="bg-adobe-pod border border-adobe-border rounded px-1 py-0.5 text-[10px] text-adobe-muted"
            >
              <option value="">+ PM</option>
              {otherUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-adobe-muted text-[11px]">
            <MessageSquare className="w-6 h-6 mb-1 opacity-40" />
            <span>No messages yet. Say hello!</span>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isMe = msg.senderId === currentUser?.id;
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div key={msg.id} className="flex flex-col text-[11px]">
                <div className="flex items-baseline gap-1.5 mb-0.5">
                  <span className={`font-bold ${getRoleColor(msg.senderRole)}`}>
                    {msg.senderName}
                  </span>
                  <span className="text-[10px] text-adobe-muted">{timeStr}</span>
                </div>
                <div className="bg-adobe-bar/60 border border-adobe-border/50 rounded px-2 py-1 text-adobe-text break-words">
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Bar */}
      <form
        onSubmit={handleSend}
        className="p-1.5 bg-adobe-bar border-t border-adobe-border flex items-center gap-1"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`Message ${
            activeChannel === "everyone"
              ? "everyone"
              : activeChannel === "hosts"
              ? "hosts"
              : "privately"
          }...`}
          disabled={!currentUser?.permissions.canChat}
          className="flex-1 bg-adobe-pod border border-adobe-border rounded px-2.5 py-1.5 text-xs text-white placeholder-adobe-muted focus:outline-none focus:border-adobe-accent"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || !currentUser?.permissions.canChat}
          className="p-1.5 rounded bg-adobe-accent text-white hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-adobe-accent transition"
          title="Send Message"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
