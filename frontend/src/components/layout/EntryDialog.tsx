import React, { useState, useEffect } from "react";
import {
  LogIn,
  Key,
  User as UserIcon,
  Shield,
  Sparkles,
  Zap,
  Copy,
  Check,
  PlusCircle,
  ExternalLink,
  Trash2,
  Users,
  Video,
  Mic,
  Activity,
  ArrowRight,
  LogOut,
  AlertCircle,
  Settings,
  Sliders,
  X,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { TransportConfig, UserRole } from "../../types";

interface EntryDialogProps {
  onJoin: (params: {
    workerUrl: string;
    roomId: string;
    username: string;
    name: string;
    role: UserRole;
    pass?: string;
    token?: string;
  }) => void;
}

interface RoomInfo {
  exists: boolean;
  roomId: string;
  title: string;
  transport: TransportConfig;
  activeUsersCount: number;
}

interface ManagedRoomItem {
  id: string;
  title: string;
  transport: TransportConfig;
  inviteLink: string;
  activeUsers: number;
  createdAt: number;
}

export const EntryDialog: React.FC<EntryDialogProps> = ({ onJoin }) => {
  // Query param detection: ?room=...
  const queryParams = new URLSearchParams(window.location.search);
  const queryRoomId = queryParams.get("room") || "";

  // View state: "guest" (participant join) or "admin_login" or "admin_panel"
  const [view, setView] = useState<"guest" | "admin_login" | "admin_panel">(() => {
    if (queryRoomId) return "guest";
    const savedToken = localStorage.getItem("classroom_admin_token");
    return savedToken ? "admin_panel" : "admin_login";
  });

  // Server WS URL auto-detection (defaults to current host)
  const defaultWsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
  const [workerUrl, setWorkerUrl] = useState(() => {
    const saved = localStorage.getItem("classroom_ws_url");
    if (saved && !saved.includes("workers.dev")) {
      return saved;
    }
    return defaultWsUrl;
  });

  // Participant Form state
  const [participantName, setParticipantName] = useState(() => localStorage.getItem("classroom_name") || "");
  const [targetRoomId, setTargetRoomId] = useState(queryRoomId || localStorage.getItem("classroom_room_id") || "main");
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [roomInfoLoading, setRoomInfoLoading] = useState(false);
  const [roomInfoError, setRoomInfoError] = useState("");

  // Admin Auth state
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem("classroom_admin_token") || "");
  const [adminUser, setAdminUser] = useState<any>(() => {
    const saved = localStorage.getItem("classroom_admin_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Admin Room Creation Form state
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [newRoomTransport, setNewRoomTransport] = useState<TransportConfig>({
    audio: "udp",
    video: "udp",
    data: "udp",
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<{ id: string; title: string; inviteLink: string } | null>(null);
  const [activeAdminRooms, setActiveAdminRooms] = useState<ManagedRoomItem[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  // Chabokan Dual-Host Network Configuration state
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [webDomain, setWebDomain] = useState("nodejs-jp5lts.chbkn.dev");
  const [streamHost, setStreamHost] = useState("services.irn18.chabokan.net");
  const [streamWsPort, setStreamWsPort] = useState(17833);
  const [streamUdpPort, setStreamUdpPort] = useState(3001);
  const [configNotice, setConfigNotice] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [isTestingPorts, setIsTestingPorts] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);

  const fetchServerConfig = () => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.webDomain) setWebDomain(data.webDomain);
        if (data.streamHost) setStreamHost(data.streamHost);
        if (data.streamWsPort) setStreamWsPort(data.streamWsPort);
        if (data.streamUdpPort) setStreamUdpPort(data.streamUdpPort);

        // WebRTC/WebSocket Realtime Stream URL goes directly to streamHost:streamWsPort!
        const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
        const sHost = (data.streamHost && data.streamHost.trim()) || "services.irn18.chabokan.net";
        const sPort = data.streamWsPort ? `:${data.streamWsPort}` : "";
        const computedWsUrl = `${wsProto}//${sHost.replace(/^https?:\/\//, "").replace(/\/+$/, "")}${sPort}/ws`;
        setWorkerUrl(computedWsUrl);
        localStorage.setItem("classroom_ws_url", computedWsUrl);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchServerConfig();
  }, []);

  const getRoomInviteLink = (roomId: string) => {
    // Web invite links always go to webDomain (HTTPS on 443 with ZERO extra ports!)
    const targetDomain = (webDomain && webDomain.trim()) || "nodejs-jp5lts.chbkn.dev";
    const cleanDomain = targetDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `https://${cleanDomain}/?room=${roomId}`;
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setConfigNotice("");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          webDomain: webDomain.trim(),
          streamHost: streamHost.trim(),
          streamWsPort: streamWsPort,
          streamUdpPort: streamUdpPort,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در ذخیره کانفیگ");
      setConfigNotice("تنظیمات با موفقیت ذخیره شد!");
      setTimeout(() => setConfigNotice(""), 3000);

      // Re-fetch to apply updated port to current session
      fetchServerConfig();
    } catch (err: any) {
      alert(err.message || "خطا در ذخیره تنظیمات");
    } finally {
      setConfigSaving(false);
    }
  };

  const handleTestPorts = async () => {
    setIsTestingPorts(true);
    setTestResult(null);

    try {
      // Test the realtime stream host and forwarded port
      const res = await fetch("/api/config/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          streamHost: streamHost.trim(),
          streamWsPort: streamWsPort,
          streamUdpPort: streamUdpPort,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("سرویس چابکان هنوز ری‌استارت نشده است. لطفاً در پنل دکمه Redeploy را بزنید.");
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "خطا در تست اتصال");

      if (data.httpReachable) {
        setTestResult({
          success: true,
          message: `اتصال به سرور زنده چابکان (${data.targetHost}:${data.wsPort}) موفقیت‌آمیز است (تاخیر: ${data.latencyMs}ms). پروتکل WS و پورت فورواردشده در دسترس است.`,
          details: data,
        });
      } else {
        setTestResult({
          success: false,
          message: `عدم امکان برقراری ارتباط با پورت فورواردشده ${data.wsPort} در سرور ${data.targetHost}. خطا: ${data.httpError || "پورت بسته است"}`,
          details: data,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "خطا در ارسال پکت‌های تست به سرور",
      });
    } finally {
      setIsTestingPorts(false);
    }
  };

  // Fetch room info when in participant mode
  useEffect(() => {
    if (view === "guest" && targetRoomId.trim()) {
      setRoomInfoLoading(true);
      setRoomInfoError("");
      fetch(`/api/rooms/${encodeURIComponent(targetRoomId.trim())}/info`)
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "اتاق مورد نظر یافت نشد یا غیرفعال است.");
          }
          return res.json();
        })
        .then((data: RoomInfo) => {
          setRoomInfo(data);
          setRoomInfoLoading(false);
        })
        .catch((err) => {
          setRoomInfo(null);
          setRoomInfoError(err.message);
          setRoomInfoLoading(false);
        });
    }
  }, [view, targetRoomId]);

  // Fetch admin active rooms when in admin panel
  const fetchAdminRooms = () => {
    if (!adminToken) return;
    fetch("/api/rooms", {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.rooms) setActiveAdminRooms(data.rooms);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (view === "admin_panel" && adminToken) {
      fetchAdminRooms();
    }
  }, [view, adminToken]);

  // Admin Login Action
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: adminUsername.trim(),
          password: adminPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "نام کاربری یا رمز عبور اشتباه است.");
      }

      setAdminToken(data.token);
      setAdminUser(data.user);
      localStorage.setItem("classroom_admin_token", data.token);
      localStorage.setItem("classroom_admin_user", JSON.stringify(data.user));
      setView("admin_panel");
    } catch (err: any) {
      setAuthError(err.message || "خطا در احراز هویت.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Admin Logout Action
  const handleAdminLogout = () => {
    setAdminToken("");
    setAdminUser(null);
    localStorage.removeItem("classroom_admin_token");
    localStorage.removeItem("classroom_admin_user");
    setView("admin_login");
  };

  // Admin Create Room Action
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomTitle.trim() || !adminToken) return;

    setCreateLoading(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          title: newRoomTitle.trim(),
          transport: newRoomTransport,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "خطا در ساخت اتاق.");
      }

      const fullInviteLink = getRoomInviteLink(data.room.id);
      setCreatedRoom({
        id: data.room.id,
        title: data.room.title,
        inviteLink: fullInviteLink,
      });
      setNewRoomTitle("");
      fetchAdminRooms();
    } catch (err: any) {
      alert(err.message || "خطا در ساخت اتاق");
    } finally {
      setCreateLoading(false);
    }
  };

  // Copy link helper
  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Enter as Admin / Host
  const handleEnterAsHost = (roomId: string) => {
    localStorage.setItem("classroom_ws_url", workerUrl);
    localStorage.setItem("classroom_room_id", roomId);

    onJoin({
      workerUrl,
      roomId,
      username: adminUser?.username || "admin",
      name: adminUser?.name || "مدیر کلاس",
      role: "host",
      token: adminToken,
    });
  };

  // Enter as Participant (requires admission approval)
  const handleParticipantJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!participantName.trim() || !targetRoomId.trim()) return;

    localStorage.setItem("classroom_ws_url", workerUrl);
    localStorage.setItem("classroom_name", participantName.trim());
    localStorage.setItem("classroom_room_id", targetRoomId.trim());

    onJoin({
      workerUrl,
      roomId: targetRoomId.trim(),
      username: `guest_${Date.now().toString(36)}`,
      name: participantName.trim(),
      role: "participant",
    });
  };

  return (
    <div className="fixed inset-0 bg-adobe-bg/95 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none overflow-y-auto" dir="rtl">
      <div className="w-full max-w-lg bg-adobe-pod border border-adobe-border rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 p-6 text-white text-center relative">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-yellow-300" />
            <h1 className="text-xl font-bold tracking-tight">سامانه جلسات آنلاین Classroom</h1>
          </div>
          <p className="text-xs text-blue-100">
            بر بستر ابری چابکان (Chabokan.net) با پشتیبانی از پروتکل فوق‌سریع UDP و WebRTC
          </p>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => setView("guest")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                view === "guest"
                  ? "bg-white text-blue-900 shadow"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>ورود با لینک دعوت (شرکت‌کننده)</span>
            </button>
            <button
              onClick={() => setView(adminToken ? "admin_panel" : "admin_login")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                view !== "guest"
                  ? "bg-white text-blue-900 shadow"
                  : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>پنل ادمین (ساخت اتاق)</span>
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* VIEW 1: PARTICIPANT JOIN SCREEN                                */}
        {/* ============================================================== */}
        {view === "guest" && (
          <form onSubmit={handleParticipantJoin} className="p-6 space-y-4 text-xs">
            {/* Room ID Input */}
            <div>
              <label className="block text-adobe-muted font-semibold mb-1 text-[11px]">
                شناسه اتاق کلاس (Room ID):
              </label>
              <input
                type="text"
                required
                value={targetRoomId}
                onChange={(e) => setTargetRoomId(e.target.value)}
                placeholder="مثال: room-123"
                className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-adobe-accent text-xs font-mono"
              />
            </div>

            {/* Room Info Card / Status */}
            {roomInfoLoading && (
              <div className="p-3 bg-adobe-bar/60 border border-adobe-border rounded-lg text-adobe-muted text-[11px] flex items-center gap-2">
                <Activity className="w-4 h-4 animate-spin text-blue-400" />
                <span>در حال دریافت اطلاعات اتاق...</span>
              </div>
            )}

            {roomInfoError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-200 text-[11px] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{roomInfoError}</span>
              </div>
            )}

            {roomInfo && (
              <div className="p-3 bg-blue-950/40 border border-blue-800/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{roomInfo.title}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-900 text-blue-200 text-[10px]">
                    {roomInfo.activeUsersCount} نفر آنلاین
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-adobe-muted">
                  <span className="flex items-center gap-1">
                    <Mic className="w-3 h-3 text-emerald-400" />
                    صدا: <strong className="text-white uppercase">{roomInfo.transport.audio}</strong>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Video className="w-3 h-3 text-emerald-400" />
                    تصویر: <strong className="text-white uppercase">{roomInfo.transport.video}</strong>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" />
                    داده: <strong className="text-white uppercase">{roomInfo.transport.data}</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Participant Name Input */}
            <div>
              <label className="block text-adobe-muted font-semibold mb-1 text-[11px] flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5 text-adobe-accent" />
                <span>نام و نام خانوادگی شما:</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                placeholder="مثال: علی احمدی"
                className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-adobe-accent text-xs"
              />
              <p className="text-[10px] text-adobe-muted mt-1">
                این نام برای استاد و سایر اعضای کلاس نمایش داده می‌شود.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!!roomInfoError}
              className={`w-full py-2.5 rounded-lg font-bold shadow-lg transition flex items-center justify-center gap-2 text-white ${
                roomInfoError
                  ? "bg-gray-700 cursor-not-allowed opacity-60"
                  : "bg-adobe-accent hover:bg-blue-600"
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>درخواست ورود به کلاس (اتاق انتظار)</span>
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setView(adminToken ? "admin_panel" : "admin_login")}
                className="text-[11px] text-adobe-accent hover:underline"
              >
                شما مدیر کلاس هستید؟ ورود به پنل ادمین
              </button>
            </div>
          </form>
        )}

        {/* ============================================================== */}
        {/* VIEW 2: ADMIN LOGIN                                           */}
        {/* ============================================================== */}
        {view === "admin_login" && (
          <form onSubmit={handleAdminLogin} className="p-6 space-y-4 text-xs">
            <div className="text-center space-y-1 mb-2">
              <h2 className="font-bold text-white text-sm">ورود مدیر برای ساخت و مدیریت کلاس‌ها</h2>
              <p className="text-[11px] text-adobe-muted">
                تنها ادمین مجاز به ایجاد اتاق جدید و تایید ورود دانشجویان است.
              </p>
            </div>

            {authError && (
              <div className="p-2.5 bg-rose-950/70 border border-rose-800 rounded-lg text-rose-200 text-[11px]">
                {authError}
              </div>
            )}

            <div>
              <label className="block text-adobe-muted font-semibold mb-1 text-[11px] flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5 text-adobe-accent" />
                <span>نام کاربری ادمین (Username):</span>
              </label>
              <input
                type="text"
                required
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                placeholder="admin"
                className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-adobe-accent text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-adobe-muted font-semibold mb-1 text-[11px] flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-adobe-host" />
                <span>رمز عبور (Password):</span>
              </label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="رمز عبور حساب ادمین"
                className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-adobe-accent text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg transition flex items-center justify-center gap-2 mt-2"
            >
              {authLoading ? (
                <Activity className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>ورود به پنل مدیریت</span>
            </button>
          </form>
        )}

        {/* ============================================================== */}
        {/* VIEW 3: ADMIN ROOM CREATION & MANAGEMENT PANEL                 */}
        {/* ============================================================== */}
        {view === "admin_panel" && (
          <div className="p-6 space-y-5 text-xs max-h-[75vh] overflow-y-auto">
            {/* Admin Header with Logout */}
            <div className="flex items-center justify-between pb-3 border-b border-adobe-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center text-indigo-400 font-bold">
                  {adminUser?.username?.[0]?.toUpperCase() || "A"}
                </div>
                <div>
                  <div className="font-bold text-white text-[12px]">{adminUser?.name || "مدیر ارشد"}</div>
                  <div className="text-[10px] text-adobe-muted">حساب کاربری ادمین فعال</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    fetchServerConfig();
                    setShowConfigModal(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-950/60 border border-blue-800 text-[11px] text-blue-300 hover:text-white hover:bg-blue-900/60 transition"
                  title="تنظیم پورت‌های فورواردشده و دامنه چابکان"
                >
                  <Settings className="w-3.5 h-3.5 text-blue-400" />
                  <span>تنظیمات شبکه چابکان</span>
                </button>
                <button
                  onClick={handleAdminLogout}
                  className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج</span>
                </button>
              </div>
            </div>

            {/* Create Room Box */}
            <form onSubmit={handleCreateRoom} className="space-y-3.5 bg-adobe-bar/40 border border-adobe-border p-4 rounded-xl">
              <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                <PlusCircle className="w-4 h-4 text-emerald-400" />
                <span>ساخت اتاق جدید و تنظیم پروتکل‌ها</span>
              </div>

              <div>
                <label className="block text-adobe-muted font-semibold mb-1 text-[11px]">
                  عنوان کلاس یا جلسه آنلاین:
                </label>
                <input
                  type="text"
                  required
                  value={newRoomTitle}
                  onChange={(e) => setNewRoomTitle(e.target.value)}
                  placeholder="مثال: کلاس آموزش React و WebRTC"
                  className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-adobe-accent text-xs"
                />
              </div>

              {/* Protocol Toggles (UDP vs WS) */}
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-semibold text-adobe-muted">
                  تنظیم پروتکل‌های انتقال (قابل تغییر به دلخواه):
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* Voice */}
                  <div className="bg-adobe-bar p-2 rounded-lg border border-adobe-border flex flex-col gap-1.5">
                    <span className="text-[10px] text-adobe-muted font-medium flex items-center gap-1">
                      <Mic className="w-3 h-3 text-emerald-400" />
                      انتقال صدا:
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setNewRoomTransport({ ...newRoomTransport, audio: "udp" })}
                        className={`flex-1 py-1 rounded text-[10px] font-bold ${
                          newRoomTransport.audio === "udp"
                            ? "bg-emerald-600 text-white"
                            : "bg-adobe-pod text-adobe-muted hover:text-white"
                        }`}
                      >
                        UDP
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewRoomTransport({ ...newRoomTransport, audio: "ws" })}
                        className={`flex-1 py-1 rounded text-[10px] font-bold ${
                          newRoomTransport.audio === "ws"
                            ? "bg-blue-600 text-white"
                            : "bg-adobe-pod text-adobe-muted hover:text-white"
                        }`}
                      >
                        WS
                      </button>
                    </div>
                  </div>

                  {/* Video */}
                  <div className="bg-adobe-bar p-2 rounded-lg border border-adobe-border flex flex-col gap-1.5">
                    <span className="text-[10px] text-adobe-muted font-medium flex items-center gap-1">
                      <Video className="w-3 h-3 text-emerald-400" />
                      انتقال وبکم:
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setNewRoomTransport({ ...newRoomTransport, video: "udp" })}
                        className={`flex-1 py-1 rounded text-[10px] font-bold ${
                          newRoomTransport.video === "udp"
                            ? "bg-emerald-600 text-white"
                            : "bg-adobe-pod text-adobe-muted hover:text-white"
                        }`}
                      >
                        UDP
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewRoomTransport({ ...newRoomTransport, video: "ws" })}
                        className={`flex-1 py-1 rounded text-[10px] font-bold ${
                          newRoomTransport.video === "ws"
                            ? "bg-blue-600 text-white"
                            : "bg-adobe-pod text-adobe-muted hover:text-white"
                        }`}
                      >
                        WS
                      </button>
                    </div>
                  </div>

                  {/* Data / Whiteboard */}
                  <div className="bg-adobe-bar p-2 rounded-lg border border-adobe-border flex flex-col gap-1.5">
                    <span className="text-[10px] text-adobe-muted font-medium flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-400" />
                      تخته و سیگنال:
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setNewRoomTransport({ ...newRoomTransport, data: "udp" })}
                        className={`flex-1 py-1 rounded text-[10px] font-bold ${
                          newRoomTransport.data === "udp"
                            ? "bg-emerald-600 text-white"
                            : "bg-adobe-pod text-adobe-muted hover:text-white"
                        }`}
                      >
                        UDP
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewRoomTransport({ ...newRoomTransport, data: "ws" })}
                        className={`flex-1 py-1 rounded text-[10px] font-bold ${
                          newRoomTransport.data === "ws"
                            ? "bg-blue-600 text-white"
                            : "bg-adobe-pod text-adobe-muted hover:text-white"
                        }`}
                      >
                        WS
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={createLoading}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow transition flex items-center justify-center gap-1.5"
              >
                {createLoading ? <Activity className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                <span>ساخت اتاق و تولید لینک دعوت</span>
              </button>
            </form>

            {/* Created Room Banner with Invite Link */}
            {createdRoom && (
              <div className="p-4 bg-emerald-950/60 border border-emerald-600/80 rounded-xl space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-200 text-xs">
                    اتاق «{createdRoom.title}» ساخته شد!
                  </span>
                </div>

                <div>
                  <div className="text-[10px] text-emerald-300/80 mb-1">
                    لینک دعوت برای ورود دانشجویان (با کلیک کپی کنید):
                  </div>
                  <div className="flex items-center gap-1.5 bg-black/40 p-2 rounded-lg border border-emerald-800">
                    <input
                      type="text"
                      readOnly
                      value={createdRoom.inviteLink}
                      className="bg-transparent flex-1 text-emerald-300 font-mono text-[11px] focus:outline-none"
                    />
                    <button
                      onClick={() => handleCopyLink(createdRoom.inviteLink)}
                      className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[10px] flex items-center gap-1 flex-shrink-0"
                    >
                      {copiedLink ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedLink ? "کپی شد!" : "کپی لینک"}</span>
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => handleEnterAsHost(createdRoom.id)}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition flex items-center justify-center gap-1.5"
                >
                  <LogIn className="w-4 h-4" />
                  <span>ورود به کلاس به عنوان استاد (Host)</span>
                </button>
              </div>
            )}

            {/* Existing Active Rooms List */}
            <div className="space-y-2">
              <div className="font-bold text-adobe-muted text-[11px] flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span>اتاق‌های فعال ایجادشده توسط شما:</span>
              </div>

              {activeAdminRooms.length === 0 ? (
                <div className="p-3 text-center text-adobe-muted text-[11px] bg-adobe-bar/30 rounded-lg">
                  هنوز اتاقی نساخته‌اید. با فرم بالا اتاق جدید بسازید.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {activeAdminRooms.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 bg-adobe-bar/60 border border-adobe-border rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-white text-xs">{r.title}</div>
                        <div className="text-[10px] text-adobe-muted flex items-center gap-2 mt-0.5">
                          <span>{r.activeUsers} کاربر آنلاین</span>
                          <span>•</span>
                          <span className="font-mono uppercase text-blue-300">
                            {r.transport.audio} / {r.transport.video} / {r.transport.data}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCopyLink(getRoomInviteLink(r.id))}
                          className="p-1.5 rounded hover:bg-adobe-border text-adobe-muted hover:text-white"
                          title="کپی لینک دعوت"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleEnterAsHost(r.id)}
                          className="px-2.5 py-1 bg-adobe-accent hover:bg-blue-600 text-white rounded text-[11px] font-semibold"
                        >
                          ورود
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chabokan Network Configuration Modal (Requirement 4) */}
        {showConfigModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none text-right" dir="rtl">
            <div className="w-full max-w-md bg-adobe-pod border border-adobe-border rounded-2xl shadow-2xl p-5 flex flex-col gap-3.5 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-adobe-border pb-2">
                <div className="flex items-center gap-2 font-bold text-white text-xs">
                  <Sliders className="w-4 h-4 text-adobe-accent" />
                  <span>تنظیمات شبکه و پورت‌های چابکان (Chabokan Port Forwarding)</span>
                </div>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="p-1 rounded text-adobe-muted hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {configNotice && (
                <div className="p-2.5 bg-emerald-950/60 border border-emerald-700 rounded-lg text-emerald-300 text-[11px] font-bold">
                  {configNotice}
                </div>
              )}

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex flex-col gap-1.5 animate-fadeIn ${
                    testResult.success
                      ? "bg-emerald-950/70 border-emerald-600 text-emerald-200"
                      : "bg-rose-950/70 border-rose-600 text-rose-200"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    {testResult.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    )}
                    <span>{testResult.success ? "نتیجه تست اتصال: موفق" : "نتیجه تست اتصال: ناموفق"}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">{testResult.message}</p>
                </div>
              )}

              <form onSubmit={handleSaveConfig} className="space-y-3 text-xs">
                {/* 1. Web Domain for User Invite Links */}
                <div>
                  <label className="block text-adobe-muted font-semibold mb-1 text-[11px]">
                    دامنه وب سایت و لینک دعوت کاربران (Web App Domain):
                  </label>
                  <input
                    type="text"
                    value={webDomain}
                    onChange={(e) => setWebDomain(e.target.value)}
                    placeholder="nodejs-jp5lts.chbkn.dev"
                    className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-adobe-accent"
                  />
                  <p className="text-[10px] text-emerald-400 mt-0.5">
                    این همان آدرسی است که چابکان به شما می‌دهد. لینک‌های دعوت ارسالی به کاربران منحصراً با این دامنه و با پروتکل HTTPS بدون هیچ پورت اضافی ساخته می‌شوند.
                  </p>
                </div>

                <div className="border-t border-adobe-border/50 pt-2" />

                {/* 2. Realtime Stream Host & Ports (services.irn18.chabokan.net) */}
                <div>
                  <label className="block text-adobe-muted font-semibold mb-1 text-[11px]">
                    آدرس سرور استریم زنده WS و UDP (Stream Server Host):
                  </label>
                  <input
                    type="text"
                    value={streamHost}
                    onChange={(e) => setStreamHost(e.target.value)}
                    placeholder="services.irn18.chabokan.net"
                    className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-adobe-accent"
                  />
                  <p className="text-[10px] text-adobe-muted mt-0.5">
                    سرور ارتباط زنده که پورت‌های فورواردشده کلاستر چابکان به آن هدایت می‌شوند.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-adobe-muted font-semibold mb-1 text-[11px]">
                      پورت فورواردشده وب‌سوکت (WS Port):
                    </label>
                    <input
                      type="number"
                      value={streamWsPort}
                      onChange={(e) => setStreamWsPort(Number(e.target.value))}
                      placeholder="17833"
                      className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-adobe-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-adobe-muted font-semibold mb-1 text-[11px]">
                      پورت فورواردشده UDP:
                    </label>
                    <input
                      type="number"
                      value={streamUdpPort}
                      onChange={(e) => setStreamUdpPort(Number(e.target.value))}
                      placeholder="3001"
                      className="w-full bg-adobe-bar border border-adobe-border rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-adobe-accent"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-adobe-border">
                  <button
                    type="button"
                    onClick={handleTestPorts}
                    disabled={isTestingPorts}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/70 border border-indigo-700 hover:bg-indigo-900 text-indigo-300 hover:text-white font-bold text-xs transition disabled:opacity-50"
                  >
                    {isTestingPorts ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    <span>{isTestingPorts ? "در حال ارسال پکت و تست..." : "تست زنده اتصال پورت‌ها"}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowConfigModal(false)}
                      className="px-3 py-1.5 rounded bg-adobe-bar text-adobe-muted hover:text-white"
                    >
                      بستن
                    </button>
                    <button
                      type="submit"
                      disabled={configSaving}
                      className="px-4 py-1.5 bg-adobe-accent hover:bg-blue-600 text-white font-bold rounded shadow transition"
                    >
                      {configSaving ? "در حال ذخیره..." : "ذخیره تنظیمات"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
