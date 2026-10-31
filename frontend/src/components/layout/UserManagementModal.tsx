import React, { useState } from "react";
import { UserCheck, UserPlus, Trash2, X, Shield, Key, User as UserIcon } from "lucide-react";
import { useRoomStore } from "../../stores/roomStore";
import { RegisteredUser, UserRole, WSMessage } from "../../types";

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  sendMessage: (msg: WSMessage) => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  sendMessage,
}) => {
  const { roomState, currentUser } = useRoomStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("participant");
  const [showAddForm, setShowAddForm] = useState(false);

  if (!isOpen) return null;

  const registeredUsers = Object.values(roomState?.registeredUsers || {});

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    const newUser: RegisteredUser = {
      username: username.trim().toLowerCase(),
      password: password.trim(),
      name: name.trim() || username.trim(),
      role,
    };

    sendMessage({ type: "ADD_USER", user: newUser });
    setUsername("");
    setPassword("");
    setName("");
    setRole("participant");
    setShowAddForm(false);
  };

  const handleDeleteUser = (userToDelete: string) => {
    if (confirm(`آیا از حذف کاربر ${userToDelete} اطمینان دارید؟`)) {
      sendMessage({ type: "DELETE_USER", username: userToDelete });
    }
  };

  const getRoleLabel = (r: UserRole) => {
    switch (r) {
      case "host":
        return "مدیر / استاد (Host)";
      case "presenter":
        return "ارائه‌دهنده (Presenter)";
      default:
        return "دانشجو / شرکت‌کننده (Participant)";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-adobe-pod border border-adobe-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs max-h-[85vh]">
        {/* Header */}
        <div className="h-10 bg-adobe-header border-b border-adobe-border px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-white text-sm">
            <UserCheck className="w-4 h-4 text-adobe-accent" />
            <span>مدیریت کاربران و حساب‌های کلاس (User Management)</span>
          </div>
          <button onClick={onClose} className="text-adobe-muted hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-adobe-text text-[11px]">
              کاربران تعریف‌شده برای این اتاق ({registeredUsers.length}):
            </span>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 px-3 py-1 bg-adobe-accent hover:bg-blue-600 text-white rounded font-medium transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{showAddForm ? "بستن فرم" : "افزودن کاربر جدید"}</span>
            </button>
          </div>

          {/* Add User Form */}
          {showAddForm && (
            <form onSubmit={handleAddUser} className="bg-adobe-bar/80 border border-adobe-border rounded-lg p-3 space-y-2.5">
              <h4 className="font-bold text-white text-[11px]">تعریف کاربر جدید</h4>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-adobe-muted mb-1 font-medium">نام کاربری (Username):</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="student1"
                    className="w-full bg-adobe-pod border border-adobe-border rounded px-2.5 py-1 text-white focus:outline-none focus:border-adobe-accent"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-adobe-muted mb-1 font-medium">رمز عبور (Password):</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-adobe-pod border border-adobe-border rounded px-2.5 py-1 text-white focus:outline-none focus:border-adobe-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-adobe-muted mb-1 font-medium">نام نمایشی (Full Name):</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="علی رضایی"
                    className="w-full bg-adobe-pod border border-adobe-border rounded px-2.5 py-1 text-white focus:outline-none focus:border-adobe-accent"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-adobe-muted mb-1 font-medium">نقش کاربر (Role):</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full bg-adobe-pod border border-adobe-border rounded px-2.5 py-1 text-white focus:outline-none"
                  >
                    <option value="participant">دانشجو (Participant)</option>
                    <option value="presenter">ارائه‌دهنده (Presenter)</option>
                    <option value="host">مدیر (Host)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 font-bold text-white rounded transition shadow"
              >
                ذخیره کاربر
              </button>
            </form>
          )}

          {/* User List */}
          <div className="space-y-1.5">
            {registeredUsers.length === 0 ? (
              <div className="p-4 text-center text-adobe-muted italic">
                هنوز کاربری تعریف نشده است.
              </div>
            ) : (
              registeredUsers.map((u) => {
                const isCurrentUser = currentUser?.name === u.name || currentUser?.name === u.username;
                return (
                  <div
                    key={u.username}
                    className="flex items-center justify-between p-2 rounded bg-adobe-bar/60 border border-adobe-border"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-adobe-pod flex items-center justify-center text-adobe-accent">
                        <UserIcon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{u.name}</span>
                          <span className="text-[10px] font-mono text-adobe-muted font-normal">(@{u.username})</span>
                        </div>
                        <div className="text-[10px] text-adobe-muted flex items-center gap-2">
                          <span className="text-amber-400 font-medium">{getRoleLabel(u.role)}</span>
                          <span>•</span>
                          <span className="font-mono">رمز: {u.password}</span>
                        </div>
                      </div>
                    </div>

                    {!isCurrentUser && (
                      <button
                        onClick={() => handleDeleteUser(u.username)}
                        className="p-1.5 text-adobe-muted hover:text-rose-400 hover:bg-rose-950/40 rounded transition"
                        title="حذف کاربر"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
