import React, { useState } from "react";
import { useRoomStore } from "./stores/roomStore";
import { useWebSocket } from "./hooks/useWebSocket";
import { useMediaBroadcast } from "./hooks/useMediaBroadcast";
import { TopMenuBar } from "./components/layout/TopMenuBar";
import { LayoutBar } from "./components/layout/LayoutBar";
import { PodWrapper } from "./components/layout/PodWrapper";
import { EntryDialog } from "./components/layout/EntryDialog";
import { WaitingRoom } from "./components/layout/WaitingRoom";
import { AttendeePod } from "./components/pods/AttendeePod";
import { ChatPod } from "./components/pods/ChatPod";
import { SharePod } from "./components/pods/SharePod/SharePod";
import { WebcamGrid } from "./components/pods/SharePod/WebcamGrid";
import { PollPod } from "./components/pods/PollPod";
import { NotesPod } from "./components/pods/NotesPod";
import { BreakoutModal } from "./components/pods/BreakoutModal";
import { UserManagementModal } from "./components/layout/UserManagementModal";
import { PodConfig, UserRole } from "./types";
import { Radio } from "lucide-react";

export function App() {
  const [connectionParams, setConnectionParams] = useState<{
    url: string;
    userId: string;
    name: string;
    role: UserRole;
  } | null>(null);

  const [isBreakoutModalOpen, setIsBreakoutModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  const {
    roomState,
    currentUser,
    isAdmitted,
    setCurrentUser,
    breakoutBroadcast,
    wsConnected,
    remoteStreams,
    ping,
  } = useRoomStore();

  const wsUrl = connectionParams?.url || null;
  const { sendMessage } = useWebSocket(wsUrl);
  const { toggleMic, toggleCam, toggleScreen } = useMediaBroadcast(sendMessage);

  const handleJoin = ({
    workerUrl,
    roomId,
    username,
    name,
    role,
    pass,
    token,
  }: {
    workerUrl: string;
    roomId: string;
    username: string;
    name: string;
    role: UserRole;
    pass?: string;
    token?: string;
  }) => {
    const userId = crypto.randomUUID();
    const cleanUrl = new URL(workerUrl);
    cleanUrl.searchParams.set("roomId", roomId);
    cleanUrl.searchParams.set("userId", userId);
    cleanUrl.searchParams.set("username", username);
    cleanUrl.searchParams.set("name", name);
    cleanUrl.searchParams.set("role", role);
    if (pass) cleanUrl.searchParams.set("pass", pass);
    if (token) cleanUrl.searchParams.set("token", token);

    const savedAdmitToken = localStorage.getItem(`classroom_admit_${roomId}`) || "";
    if (savedAdmitToken) {
      cleanUrl.searchParams.set("admitToken", savedAdmitToken);
    }

    const isHost = role === "host";
    const hasPriorAdmission = isHost || !!savedAdmitToken;
    useRoomStore.getState().setAdmission(hasPriorAdmission);

    setCurrentUser({
      id: userId,
      name,
      role,
      status: "none",
      permissions: {
        canAudio: role !== "participant",
        canVideo: role !== "participant",
        canScreen: role !== "participant",
        canDraw: role !== "participant",
        canChat: true,
        canShareDoc: role !== "participant",
      },
      joinedAt: Date.now(),
      admitted: isHost,
    });

    setConnectionParams({
      url: cleanUrl.toString(),
      userId,
      name,
      role,
    });
  };

  const renderPodContent = (pod: PodConfig) => {
    switch (pod.type) {
      case "attendee":
        return <AttendeePod sendMessage={sendMessage} />;
      case "camera":
        return <WebcamGrid onToggleCam={toggleCam} />;
      case "chat":
        return <ChatPod sendMessage={sendMessage} />;
      case "share":
        return (
          <SharePod
            sendMessage={sendMessage}
            onToggleScreen={toggleScreen}
            onToggleCam={toggleCam}
          />
        );
      case "poll":
        return <PollPod sendMessage={sendMessage} />;
      case "notes":
        return <NotesPod sendMessage={sendMessage} />;
      default:
        return <div className="p-4 text-adobe-muted">Unknown Pod</div>;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-adobe-bg text-adobe-text font-sans">
      {/* Entry Login Dialog */}
      {!connectionParams && <EntryDialog onJoin={handleJoin} />}

      {/* Connection Notice / Reconnect Helper */}
      {connectionParams && !wsConnected && (
        <div className="bg-amber-950/90 border-b border-amber-800 px-3 py-1.5 flex items-center justify-between text-xs text-amber-200 z-50">
          <span className="truncate mr-2">
            Connecting to server: <code className="text-white font-mono text-[10px]">{connectionParams.url}</code>
          </span>
          <button
            onClick={() => setConnectionParams(null)}
            className="px-2.5 py-1 rounded bg-amber-800 hover:bg-amber-700 text-white font-semibold text-[11px] flex-shrink-0 transition"
          >
            Change Server URL
          </button>
        </div>
      )}

      {/* Waiting Room Barrier */}
      {connectionParams && !isAdmitted && <WaitingRoom />}

      {/* Breakout Broadcast Floating Banner */}
      {breakoutBroadcast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-black px-4 py-2 rounded-lg shadow-2xl font-bold text-xs flex items-center gap-2 animate-bounce">
          <Radio className="w-4 h-4" />
          <span>Host Broadcast: {breakoutBroadcast}</span>
        </div>
      )}

      {/* Weak Connection Alert (Requirement 2) */}
      {connectionParams && isAdmitted && ping > 350 && (
        <div className="bg-rose-950/90 border-b border-rose-800 px-3 py-1 flex items-center justify-between text-xs text-rose-200 z-50">
          <span className="flex items-center gap-1.5 font-medium">
            <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            <span>کیفیت اتصال اینترنت شما ضعیف است ({ping}ms). ممکن است صدا یا تصویر با تاخیر پخش شود.</span>
          </span>
        </div>
      )}

      {/* Top Application Bar */}
      <TopMenuBar
        sendMessage={sendMessage}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onToggleScreen={toggleScreen}
        onOpenBreakouts={() => setIsBreakoutModalOpen(true)}
        onOpenUsers={() => setIsUserModalOpen(true)}
      />

      {/* Main Canvas Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Dynamic 2D Pod Canvas */}
        <main className="flex-1 relative overflow-hidden bg-adobe-bg/40">
          {roomState?.currentLayout?.pods.map((pod) => (
            <PodWrapper key={pod.id} pod={pod} sendMessage={sendMessage}>
              {renderPodContent(pod)}
            </PodWrapper>
          ))}
        </main>
      </div>

      {/* Breakout Rooms Modal */}
      <BreakoutModal
        isOpen={isBreakoutModalOpen}
        onClose={() => setIsBreakoutModalOpen(false)}
        sendMessage={sendMessage}
      />

      {/* User Management Modal */}
      <UserManagementModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        sendMessage={sendMessage}
      />
    </div>
  );
}
