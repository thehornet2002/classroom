import React, { useState } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Hand,
  Volume2,
  VolumeX,
  Wifi,
  MoreVertical,
  Check,
  X,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Smile,
  LogOut,
  Layers,
  Radio,
  Circle,
  Square,
  UserCheck,
  Zap,
  Activity,
  Sliders,
  Download,
  Film,
  PowerOff,
  KeyRound,
} from "lucide-react";
import { useRoomStore } from "../../stores/roomStore";
import { TransportConfig, UserStatus, WSMessage } from "../../types";
import { useMeetingRecorder } from "../../hooks/useMeetingRecorder";

interface TopMenuBarProps {
  sendMessage: (msg: WSMessage) => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreen: () => void;
  onOpenBreakouts: () => void;
  onOpenUsers?: () => void;
}

export const TopMenuBar: React.FC<TopMenuBarProps> = ({
  sendMessage,
  onToggleMic,
  onToggleCam,
  onToggleScreen,
  onOpenBreakouts,
  onOpenUsers,
}) => {
  const {
    roomState,
    currentUser,
    isMicOn,
    isCamOn,
    isScreenSharing,
    wsConnected,
    prepareMode,
    setPrepareMode,
  } = useRoomStore();

  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [meetingMenuOpen, setMeetingMenuOpen] = useState(false);
  const [transportMenuOpen, setTransportMenuOpen] = useState(false);
  const [recordingsModalOpen, setRecordingsModalOpen] = useState(false);
  const [recordingsList, setRecordingsList] = useState<any[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const { isRecording, recordingTimeStr, startRecording, stopRecording } = useMeetingRecorder(sendMessage);

  const transport = useRoomStore((s) => s.transport);
  const setTransport = useRoomStore((s) => s.setTransport);
  const completedRecordings = useRoomStore((s) => s.completedRecordings);
  const ping = useRoomStore((s) => s.ping);

  const fetchRecordings = () => {
    setRecordingsLoading(true);
    fetch(`/api/recordings?sessionId=${encodeURIComponent(roomState?.roomId || "")}`)
      .then((res) => res.json())
      .then((data) => {
        setRecordingsList(data.recordings || []);
        setRecordingsLoading(false);
      })
      .catch(() => setRecordingsLoading(false));
  };

  const handleEndRoom = async () => {
    if (confirm("آیا مطمئن هستید که می‌خواهید کلاس را برای همه شرکت‌کنندگان ببندید و اتاق را پایان دهید؟")) {
      sendMessage({ type: "CLOSE_ROOM", reason: "کلاس توسط مدیر به پایان رسید." });
      if (roomState?.roomId) {
        fetch(`/api/rooms/${encodeURIComponent(roomState.roomId)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${localStorage.getItem("classroom_admin_token") || ""}` },
        }).catch(() => {});
      }
      window.location.href = window.location.pathname;
    }
  };

  const handleUpdateTransport = (key: keyof TransportConfig, val: "udp" | "ws") => {
    if (!isHost) return;
    const nextTransport: TransportConfig = {
      ...transport,
      [key]: val,
    };
    setTransport(nextTransport);
    sendMessage({ type: "UPDATE_TRANSPORT", transport: nextTransport });
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;

    setPasswordLoading(true);
    setPasswordStatus(null);
    try {
      const token = localStorage.getItem("classroom_admin_token") || "";
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "خطا در تغییر رمز عبور");
      }
      setPasswordStatus({ success: true, message: data.message || "رمز عبور با موفقیت تغییر یافت." });
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => {
        setPasswordModalOpen(false);
        setPasswordStatus(null);
      }, 1800);
    } catch (err: any) {
      setPasswordStatus({ success: false, message: err.message || "خطا در تغییر رمز عبور" });
    } finally {
      setPasswordLoading(false);
    }
  };

  const isHost = currentUser?.role === "host";
  const isPresenter = currentUser?.role === "presenter";
  const canAudio = isHost || isPresenter || !!currentUser?.permissions.canAudio;
  const canVideo = isHost || isPresenter || !!currentUser?.permissions.canVideo;
  const canScreen = isHost || isPresenter || !!currentUser?.permissions.canScreen;

  const handleStatusChange = (status: UserStatus) => {
    sendMessage({ type: "STATUS_CHANGE", status });
    setStatusMenuOpen(false);
  };

  const getStatusIcon = (status?: UserStatus) => {
    switch (status) {
      case "raised_hand":
        return <Hand className="w-4 h-4 text-amber-400 fill-amber-400" />;
      case "agree":
        return <ThumbsUp className="w-4 h-4 text-emerald-400" />;
      case "disagree":
        return <ThumbsDown className="w-4 h-4 text-rose-400" />;
      case "away":
        return <Clock className="w-4 h-4 text-zinc-400" />;
      default:
        return <Hand className="w-4 h-4" />;
    }
  };

  return (
    <header className="h-11 bg-adobe-bar border-b border-adobe-border flex items-center justify-between px-3 z-50 text-xs">
      {/* Left: Meeting Branding & Menu */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setMeetingMenuOpen(!meetingMenuOpen)}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-adobe-pod transition font-semibold text-adobe-text"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            <span>{roomState?.roomName || "Classroom"}</span>
            <MoreVertical className="w-3.5 h-3.5 text-adobe-muted" />
          </button>

          {meetingMenuOpen && (
            <div className="absolute left-0 mt-1 w-48 bg-adobe-pod border border-adobe-border rounded shadow-lg py-1 z-50">
              <div className="px-3 py-1.5 font-bold border-b border-adobe-border text-adobe-muted">
                Room #{roomState?.roomId}
              </div>
              {isHost && (
                <>
                  <button
                    onClick={() => {
                      setMeetingMenuOpen(false);
                      onOpenUsers?.();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-adobe-border flex items-center gap-2"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-adobe-accent" />
                    <span>مدیریت کاربران (Users)</span>
                  </button>
                  <button
                    onClick={() => {
                      setMeetingMenuOpen(false);
                      onOpenBreakouts();
                    }}
                    className="w-full text-right px-3 py-1.5 hover:bg-adobe-border flex items-center gap-2"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>اتاق‌های تفکیک‌شده (Breakout)</span>
                  </button>
                </>
              )}

              <button
                onClick={() => {
                  setMeetingMenuOpen(false);
                  fetchRecordings();
                  setRecordingsModalOpen(true);
                }}
                className="w-full text-right px-3 py-1.5 hover:bg-adobe-border flex items-center gap-2 text-blue-300"
              >
                <Film className="w-3.5 h-3.5 text-blue-400" />
                <span>ویدیوهای ضبط‌شده (Recordings)</span>
              </button>

              {isHost && (
                <button
                  onClick={() => {
                    setMeetingMenuOpen(false);
                    setPasswordStatus(null);
                    setPasswordModalOpen(true);
                  }}
                  className="w-full text-right px-3 py-1.5 hover:bg-adobe-border flex items-center gap-2 text-amber-300"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>تغییر رمز عبور مدیر (Password)</span>
                </button>
              )}

              <div className="border-t border-adobe-border my-1" />

              {isHost && (
                <button
                  onClick={handleEndRoom}
                  className="w-full text-right px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 flex items-center gap-2 font-bold"
                >
                  <PowerOff className="w-3.5 h-3.5 text-rose-400" />
                  <span>بستن و اتمام کلاس (End Room)</span>
                </button>
              )}

              <button
                onClick={() => window.location.reload()}
                className="w-full text-right px-3 py-1.5 hover:bg-adobe-border text-adobe-muted flex items-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>خروج از جلسه</span>
              </button>
            </div>
          )}
        </div>

        {/* Connection status badge with latency ping (Requirement 2) */}
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border ${
            !wsConnected
              ? "bg-rose-950/60 border-rose-800 text-rose-400 animate-pulse"
              : ping > 300
              ? "bg-amber-950/60 border-amber-800 text-amber-300 animate-pulse"
              : ping > 120
              ? "bg-blue-950/40 border-blue-800 text-blue-300"
              : "bg-emerald-950/40 border-emerald-800 text-emerald-400"
          }`}
          title={
            !wsConnected
              ? "در حال اتصال به سرور..."
              : ping > 300
              ? "کیفیت ارتباط ضعیف است (تاخیر بالا)"
              : "ارتباط پایدار و عالی"
          }
        >
          <Wifi className="w-3.5 h-3.5" />
          <span>
            {wsConnected
              ? ping > 0
                ? `${ping}ms (${ping > 300 ? "ارتباط ضعیف" : ping > 120 ? "متوسط" : "عالی"})`
                : "متصل"
              : "در حال اتصال..."}
          </span>
        </div>

        {/* Realtime Transport Indicator & Host Controls */}
        <div className="relative">
          <button
            onClick={() => setTransportMenuOpen(!transportMenuOpen)}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800/80 text-[11px] text-blue-300 hover:text-white hover:bg-blue-900/60 transition"
            title="وضعیت پروتکل‌های انتقال زنده (UDP/WS)"
          >
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="font-mono font-bold uppercase">
              {transport.audio.toUpperCase()} / {transport.video.toUpperCase()}
            </span>
            {isHost && <Sliders className="w-3 h-3 text-blue-400" />}
          </button>

          {transportMenuOpen && (
            <div className="absolute left-0 mt-1 w-64 bg-adobe-pod border border-adobe-border rounded-lg shadow-2xl p-3 z-50 text-xs text-white">
              <div className="flex items-center justify-between border-b border-adobe-border pb-1.5 mb-2">
                <span className="font-bold flex items-center gap-1 text-blue-300">
                  <Activity className="w-3.5 h-3.5 text-blue-400" />
                  تنظیم پروتکل‌های انتقال (UDP / WS)
                </span>
                <span className="text-[10px] text-adobe-muted">
                  {isHost ? "اختیار ادمین" : "فقط مشاهده"}
                </span>
              </div>

              {/* Audio Transport */}
              <div className="flex items-center justify-between py-1 border-b border-adobe-border/40 text-[11px]">
                <span>انتقال صدا (Audio):</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={!isHost}
                    onClick={() => handleUpdateTransport("audio", "udp")}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      transport.audio === "udp"
                        ? "bg-emerald-600 text-white"
                        : "bg-adobe-bar text-adobe-muted hover:text-white"
                    }`}
                  >
                    UDP (کمترین تاخیر)
                  </button>
                  <button
                    disabled={!isHost}
                    onClick={() => handleUpdateTransport("audio", "ws")}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      transport.audio === "ws"
                        ? "bg-blue-600 text-white"
                        : "bg-adobe-bar text-adobe-muted hover:text-white"
                    }`}
                  >
                    WS (TCP)
                  </button>
                </div>
              </div>

              {/* Video Transport */}
              <div className="flex items-center justify-between py-1 border-b border-adobe-border/40 text-[11px]">
                <span>انتقال وبکم (Video):</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={!isHost}
                    onClick={() => handleUpdateTransport("video", "udp")}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      transport.video === "udp"
                        ? "bg-emerald-600 text-white"
                        : "bg-adobe-bar text-adobe-muted hover:text-white"
                    }`}
                  >
                    UDP (زنده)
                  </button>
                  <button
                    disabled={!isHost}
                    onClick={() => handleUpdateTransport("video", "ws")}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      transport.video === "ws"
                        ? "bg-blue-600 text-white"
                        : "bg-adobe-bar text-adobe-muted hover:text-white"
                    }`}
                  >
                    WS (TCP)
                  </button>
                </div>
              </div>

              {/* Data / Whiteboard Transport */}
              <div className="flex items-center justify-between py-1 text-[11px]">
                <span>تخته و رویدادها:</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={!isHost}
                    onClick={() => handleUpdateTransport("data", "udp")}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      transport.data === "udp"
                        ? "bg-emerald-600 text-white"
                        : "bg-adobe-bar text-adobe-muted hover:text-white"
                    }`}
                  >
                    UDP
                  </button>
                  <button
                    disabled={!isHost}
                    onClick={() => handleUpdateTransport("data", "ws")}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      transport.data === "ws"
                        ? "bg-blue-600 text-white"
                        : "bg-adobe-bar text-adobe-muted hover:text-white"
                    }`}
                  >
                    WS
                  </button>
                </div>
              </div>

              {isHost && (
                <p className="mt-2 text-[10px] text-adobe-muted text-center">
                  با تغییر وضعیت، پروتکل برای همه شرکت‌کنندگان بی‌درنگ اعمال می‌شود.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center: Primary Media Controls (Classic Adobe Connect top toolbar) */}
      <div className="flex items-center gap-1 bg-adobe-pod/60 p-0.5 rounded-md border border-adobe-border/60">
        {/* Speaker Volume (Always available) */}
        <button
          title="Speaker On"
          className="p-1.5 rounded hover:bg-adobe-border text-emerald-400"
        >
          <Volume2 className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-adobe-border mx-0.5" />

        {/* Microphone Toggle */}
        <button
          onClick={onToggleMic}
          disabled={!canAudio}
          title={!canAudio ? "No microphone permission" : isMicOn ? "Mute Microphone" : "Connect Microphone"}
          className={`flex items-center gap-1 px-2 py-1 rounded transition font-medium ${
            !canAudio
              ? "opacity-40 cursor-not-allowed text-adobe-muted"
              : isMicOn
              ? "bg-emerald-600 text-white shadow-sm"
              : "hover:bg-adobe-border text-adobe-text"
          }`}
        >
          {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          <span>Mic</span>
        </button>

        {/* Camera Toggle */}
        <button
          onClick={onToggleCam}
          disabled={!canVideo}
          title={!canVideo ? "No camera permission" : isCamOn ? "Stop Webcam" : "Start Webcam"}
          className={`flex items-center gap-1 px-2 py-1 rounded transition font-medium ${
            !canVideo
              ? "opacity-40 cursor-not-allowed text-adobe-muted"
              : isCamOn
              ? "bg-emerald-600 text-white shadow-sm"
              : "hover:bg-adobe-border text-adobe-text"
          }`}
        >
          {isCamOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          <span>Webcam</span>
        </button>

        {/* Screen Share Toggle */}
        <button
          onClick={onToggleScreen}
          disabled={!canScreen}
          title={!canScreen ? "No screen share permission" : isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}
          className={`flex items-center gap-1 px-2 py-1 rounded transition font-medium ${
            !canScreen
              ? "opacity-40 cursor-not-allowed text-adobe-muted"
              : isScreenSharing
              ? "bg-blue-600 text-white shadow-sm"
              : "hover:bg-adobe-border text-adobe-text"
          }`}
        >
          <MonitorUp className="w-4 h-4" />
          <span>Share</span>
        </button>

        {/* Record Meeting Button (Restricted to Host only) */}
        {isHost && (
          <>
            <div className="w-[1px] h-4 bg-adobe-border mx-0.5" />
            {isRecording ? (
              <button
                onClick={stopRecording}
                className="flex items-center gap-1 px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white font-medium transition animate-pulse"
                title="Stop and save recording"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span className="font-mono text-[11px] font-bold">REC {recordingTimeStr}</span>
              </button>
            ) : (
              <button
                onClick={startRecording}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-adobe-border text-adobe-muted hover:text-white transition font-medium"
                title="Record this meeting (Audio & Screen)"
              >
                <Circle className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                <span>Record</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Right: Status Reactions & Host Controls */}
      <div className="flex items-center gap-2">
        {/* Host Prepare Mode Indicator */}
        {isHost && (
          <button
            onClick={() => setPrepareMode(!prepareMode)}
            className={`px-2 py-1 rounded border text-[11px] font-medium flex items-center gap-1 transition ${
              prepareMode
                ? "bg-amber-900/60 border-amber-600 text-amber-300"
                : "border-adobe-border text-adobe-muted hover:bg-adobe-pod"
            }`}
            title="Prepare Mode lets Host edit layout privately before publishing"
          >
            <Radio className="w-3 h-3" />
            <span>{prepareMode ? "Prepare Mode: ON" : "Prepare Mode"}</span>
          </button>
        )}

        {/* Raise Hand & Status Menu */}
        <div className="relative">
          <button
            onClick={() => setStatusMenuOpen(!statusMenuOpen)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded border transition ${
              currentUser?.status !== "none"
                ? "bg-amber-950/60 border-amber-600 text-amber-300 font-semibold"
                : "border-adobe-border hover:bg-adobe-pod text-adobe-text"
            }`}
          >
            {getStatusIcon(currentUser?.status)}
            <span>
              {currentUser?.status === "none"
                ? "Status"
                : currentUser?.status.replace("_", " ")}
            </span>
          </button>

          {statusMenuOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-adobe-pod border border-adobe-border rounded shadow-xl py-1 z-50 text-xs">
              <button
                onClick={() => handleStatusChange("raised_hand")}
                className="w-full text-left px-3 py-1.5 hover:bg-adobe-border flex items-center gap-2 text-amber-300"
              >
                <Hand className="w-4 h-4" />
                <span>Raise Hand</span>
              </button>
              <button
                onClick={() => handleStatusChange("agree")}
                className="w-full text-left px-3 py-1.5 hover:bg-adobe-border flex items-center gap-2 text-emerald-400"
              >
                <ThumbsUp className="w-4 h-4" />
                <span>Agree</span>
              </button>
              <button
                onClick={() => handleStatusChange("disagree")}
                className="w-full text-left px-3 py-1.5 hover:bg-adobe-border flex items-center gap-2 text-rose-400"
              >
                <ThumbsDown className="w-4 h-4" />
                <span>Disagree</span>
              </button>
              <button
                onClick={() => handleStatusChange("away")}
                className="w-full text-left px-3 py-1.5 hover:bg-adobe-border flex items-center gap-2 text-zinc-300"
              >
                <Clock className="w-4 h-4" />
                <span>Step Away</span>
              </button>
              <button
                onClick={() => handleStatusChange("applause")}
                className="w-full text-left px-3 py-1.5 hover:bg-adobe-border flex items-center gap-2 text-purple-300"
              >
                <Smile className="w-4 h-4" />
                <span>Applause</span>
              </button>
              <div className="border-t border-adobe-border my-1" />
              <button
                onClick={() => handleStatusChange("none")}
                className="w-full text-left px-3 py-1.5 hover:bg-adobe-border flex items-center gap-2 text-adobe-muted"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Status</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recordings Modal (Requirement 5 & 7) */}
      {recordingsModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-right select-none" dir="rtl">
          <div className="w-full max-w-md bg-adobe-pod border border-adobe-border rounded-xl shadow-2xl p-4 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-adobe-border pb-2 mb-3">
              <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                <Film className="w-4 h-4 text-adobe-accent" />
                <span>ویدیوهای ضبط‌شده کلاس (Recordings)</span>
              </div>
              <button
                onClick={() => setRecordingsModalOpen(false)}
                className="p-1 rounded text-adobe-muted hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {recordingsLoading ? (
                <div className="p-4 text-center text-adobe-muted text-xs">در حال بارگذاری لیست ویدیوها...</div>
              ) : recordingsList.length === 0 && completedRecordings.length === 0 ? (
                <div className="p-6 text-center text-adobe-muted text-xs space-y-1">
                  <Film className="w-8 h-8 mx-auto opacity-30 mb-2" />
                  <p>هنوز ویدیویی برای این جلسه ضبط نشده است.</p>
                  <p className="text-[10px]">استاد با زدن دکمه Record می‌تواند جلسه را ضبط نماید.</p>
                </div>
              ) : (
                <>
                  {/* Newly completed recordings in current turn */}
                  {completedRecordings.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-2.5 bg-emerald-950/40 border border-emerald-800/80 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-emerald-200 text-xs">{rec.title}</div>
                        <div className="text-[10px] text-emerald-400 mt-0.5">همین الان ذخیره شد</div>
                      </div>
                      <a
                        href={rec.downloadUrl}
                        download
                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[11px] font-bold shadow"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>دانلود ویدیو</span>
                      </a>
                    </div>
                  ))}

                  {/* Past recordings fetched from server */}
                  {recordingsList.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-2.5 bg-adobe-bar/60 border border-adobe-border rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-white text-xs">{rec.title}</div>
                        <div className="text-[10px] text-adobe-muted flex items-center gap-2 mt-0.5">
                          <span>استاد: {rec.teacher_name}</span>
                          <span>•</span>
                          <span>{(rec.filesize / (1024 * 1024)).toFixed(1)} MB</span>
                          <span>•</span>
                          <span>{new Date(rec.created_at).toLocaleDateString("fa-IR")}</span>
                        </div>
                      </div>
                      <a
                        href={`/api/recordings/${rec.id}/download`}
                        download
                        className="flex items-center gap-1 px-2.5 py-1 bg-adobe-accent hover:bg-blue-600 text-white rounded text-[11px] font-semibold shadow"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>دانلود</span>
                      </a>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="pt-3 border-t border-adobe-border mt-3 text-center">
              <button
                onClick={() => setRecordingsModalOpen(false)}
                className="w-full py-1.5 bg-adobe-bar hover:bg-adobe-border text-adobe-muted hover:text-white rounded text-xs"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Change Modal for Host */}
      {passwordModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-right select-none" dir="rtl">
          <div className="w-full max-w-sm bg-adobe-pod border border-adobe-border rounded-xl shadow-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-adobe-border pb-2">
              <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>تغییر رمز عبور مدیر (Host Password)</span>
              </div>
              <button
                onClick={() => setPasswordModalOpen(false)}
                className="p-1 rounded text-adobe-muted hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {passwordStatus && (
              <div
                className={`p-2.5 rounded-lg text-xs font-semibold ${
                  passwordStatus.success
                    ? "bg-emerald-950/80 border border-emerald-600 text-emerald-300"
                    : "bg-rose-950/80 border border-rose-600 text-rose-300"
                }`}
              >
                {passwordStatus.message}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-3 text-xs">
              <div>
                <label className="block text-adobe-muted mb-1 text-[11px] font-semibold">رمز عبور فعلی:</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="رمز فعلی خود را وارد کنید"
                  className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-adobe-accent text-xs"
                />
              </div>

              <div>
                <label className="block text-adobe-muted mb-1 text-[11px] font-semibold">رمز عبور جدید:</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="حداقل ۴ کاراکتر"
                  className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-adobe-accent text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-adobe-border">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-adobe-bar hover:bg-adobe-border text-adobe-muted hover:text-white"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-4 py-1.5 bg-adobe-accent hover:bg-blue-600 text-white font-bold rounded shadow transition disabled:opacity-50"
                >
                  {passwordLoading ? "در حال ذخیره..." : "ثبت رمز جدید"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
