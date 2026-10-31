import React from "react";
import { Loader2, LogOut, Clock, ShieldCheck } from "lucide-react";
import { useRoomStore } from "../../stores/roomStore";

export const WaitingRoom: React.FC = () => {
  const { admissionMessage, roomState, currentUser } = useRoomStore();

  return (
    <div className="fixed inset-0 bg-adobe-bg/95 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none" dir="rtl">
      <div className="w-full max-w-sm bg-adobe-pod border border-adobe-border rounded-2xl shadow-2xl p-6 text-center text-xs flex flex-col items-center animate-fadeIn">
        <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-3 shadow-inner">
          <Loader2 className="w-7 h-7 animate-spin text-adobe-accent" />
        </div>

        <h3 className="text-base font-bold text-white mb-1">شما در صف انتظار هستید</h3>
        <p className="text-adobe-muted text-xs mb-4 max-w-xs leading-relaxed">
          {admissionMessage || "درخواست ورود شما برای مدیر کلاس ارسال شد. لطفاً منتظر بمانید تا مدیر شما را تایید کند."}
        </p>

        <div className="w-full p-3 rounded-xl bg-adobe-bar/60 border border-adobe-border mb-4 text-[11px] text-adobe-muted space-y-1 text-right">
          <div className="flex items-center justify-between">
            <span className="text-adobe-muted">کلاس:</span>
            <strong className="text-white truncate max-w-[180px]">{roomState?.roomName || "کلاس آنلاین"}</strong>
          </div>
          {currentUser?.name && (
            <div className="flex items-center justify-between">
              <span className="text-adobe-muted">نام شما:</span>
              <strong className="text-blue-300">{currentUser.name}</strong>
            </div>
          )}
          <div className="flex items-center justify-between text-emerald-400 pt-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>وضعیت:</span>
            </span>
            <span>در انتظار تایید مدیر...</span>
          </div>
        </div>

        <button
          onClick={() => {
            window.location.href = window.location.pathname;
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-adobe-bar border border-adobe-border text-adobe-muted hover:text-white hover:bg-adobe-border text-xs transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>انصراف و خروج</span>
        </button>
      </div>
    </div>
  );
};
