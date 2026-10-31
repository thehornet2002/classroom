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
import { PollPod } from "./components/pods/PollPod";
import { NotesPod } from "./components/pods/NotesPod";
import { BreakoutModal } from "./components/pods/BreakoutModal";
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

  const {
    roomState,
    currentUser,
    isAdmitted,
    setCurrentUser,
    breakoutBroadcast,
  } = useRoomStore();

  const wsUrl = connectionParams?.url || null;
  const { sendMessage } = useWebSocket(wsUrl);
  const { toggleMic, toggleCam, toggleScreen } = useMediaBroadcast(sendMessage);

  const handleJoin = ({
    workerUrl,
    roomId,
    name,
    role,
    pass,
  }: {
    workerUrl: string;
    roomId: string;
    name: string;
    role: UserRole;
    pass: string;
  }) => {
    const userId = crypto.randomUUID();
    const cleanUrl = new URL(workerUrl);
    cleanUrl.searchParams.set("roomId", roomId);
    cleanUrl.searchParams.set("userId", userId);
    cleanUrl.searchParams.set("name", name);
    cleanUrl.searchParams.set("role", role);
    if (pass) cleanUrl.searchParams.set("pass", pass);

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
      admitted: role === "host",
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

      {/* Waiting Room Barrier */}
      {connectionParams && !isAdmitted && <WaitingRoom />}

      {/* Breakout Broadcast Floating Banner */}
      {breakoutBroadcast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-black px-4 py-2 rounded-lg shadow-2xl font-bold text-xs flex items-center gap-2 animate-bounce">
          <Radio className="w-4 h-4" />
          <span>Host Broadcast: {breakoutBroadcast}</span>
        </div>
      )}

      {/* Top Application Bar */}
      <TopMenuBar
        sendMessage={sendMessage}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onToggleScreen={toggleScreen}
        onOpenBreakouts={() => setIsBreakoutModalOpen(true)}
      />

      {/* Main Canvas Area + Right Layout Bar */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Dynamic 2D Pod Canvas */}
        <main className="flex-1 relative overflow-hidden bg-adobe-bg/40">
          {roomState?.currentLayout?.pods.map((pod) => (
            <PodWrapper key={pod.id} pod={pod} sendMessage={sendMessage}>
              {renderPodContent(pod)}
            </PodWrapper>
          ))}
        </main>

        {/* Right Layout Presets Sidebar */}
        <LayoutBar sendMessage={sendMessage} />
      </div>

      {/* Breakout Rooms Modal */}
      <BreakoutModal
        isOpen={isBreakoutModalOpen}
        onClose={() => setIsBreakoutModalOpen(false)}
        sendMessage={sendMessage}
      />
    </div>
  );
}
