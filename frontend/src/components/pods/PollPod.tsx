import React, { useState } from "react";
import {
  BarChart2,
  Plus,
  CheckCircle,
  Eye,
  EyeOff,
  Trash2,
  Send,
  Lock,
  UserCheck,
  Users,
  Copy,
  Check,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useRoomStore } from "../../stores/roomStore";
import { Poll, PollOption, WSMessage } from "../../types";

interface PollPodProps {
  sendMessage: (msg: WSMessage) => void;
}

export const PollPod: React.FC<PollPodProps> = ({ sendMessage }) => {
  const { roomState, currentUser } = useRoomStore();
  const [isCreating, setIsCreating] = useState(false);
  const [question, setQuestion] = useState("");
  const [pollType, setPollType] = useState<"single" | "multiple" | "text" | "attendance">("single");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [options, setOptions] = useState<string[]>(["گزینه ۱", "گزینه ۲"]);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [expandedOptionDetails, setExpandedOptionDetails] = useState<Record<string, boolean>>({});
  const [copiedAttendance, setCopiedAttendance] = useState(false);

  const isPresenterOrHost =
    currentUser?.role === "host" || currentUser?.role === "presenter";

  const activePoll = roomState?.activePollId
    ? roomState.polls[roomState.activePollId]
    : Object.values(roomState?.polls || {})[0];

  const handleCreatePoll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    let pollOptions: PollOption[] = [];
    if (pollType === "attendance") {
      pollOptions = [
        {
          id: crypto.randomUUID(),
          text: "حاضرم",
          votes: [],
          voterDetails: [],
        },
      ];
    } else if (pollType !== "text") {
      pollOptions = options
        .filter((o) => o.trim())
        .map((text) => ({
          id: crypto.randomUUID(),
          text: text.trim(),
          votes: [],
          voterDetails: [],
        }));
    }

    const newPoll: Poll = {
      id: crypto.randomUUID(),
      question: question.trim(),
      type: pollType,
      isAnonymous: pollType === "attendance" ? false : isAnonymous,
      options: pollOptions,
      textAnswers: [],
      isOpen: true,
      broadcastResults: pollType === "attendance" ? false : true,
      createdAt: Date.now(),
    };

    sendMessage({ type: "POLL_CREATE", poll: newPoll });
    useRoomStore.getState().setPoll(newPoll);
    setIsCreating(false);
    setQuestion("");
    setOptions(["گزینه ۱", "گزینه ۲"]);
  };

  const handleVote = () => {
    if (!activePoll || !currentUser || !activePoll.isOpen) return;

    if (activePoll.type === "text") {
      if (!textAnswer.trim()) return;
      sendMessage({
        type: "POLL_VOTE",
        pollId: activePoll.id,
        textAnswer: textAnswer.trim(),
      });
      setTextAnswer("");
    } else {
      if (selectedOptions.length === 0) return;
      sendMessage({
        type: "POLL_VOTE",
        pollId: activePoll.id,
        optionIds: selectedOptions,
      });
    }
  };

  const togglePollStatus = (isOpen: boolean) => {
    if (!activePoll || !isPresenterOrHost) return;
    sendMessage({
      type: "POLL_STATUS",
      pollId: activePoll.id,
      isOpen,
      broadcastResults: activePoll.broadcastResults,
    });
  };

  const toggleBroadcast = (broadcast: boolean) => {
    if (!activePoll || !isPresenterOrHost) return;
    sendMessage({
      type: "POLL_STATUS",
      pollId: activePoll.id,
      isOpen: activePoll.isOpen,
      broadcastResults: broadcast,
    });
  };

  const handleDeletePoll = () => {
    if (!activePoll || !isPresenterOrHost) return;
    sendMessage({ type: "POLL_REMOVE", pollId: activePoll.id });
    useRoomStore.getState().removePoll(activePoll.id);
  };

  const handleCopyAttendance = () => {
    if (!activePoll || activePoll.type !== "attendance") return;
    const attendees = activePoll.options[0]?.voterDetails || [];
    const text = attendees
      .map((a, i) => `${i + 1}. ${a.userName} (${new Date(a.timestamp).toLocaleTimeString("fa-IR")})`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopiedAttendance(true);
    setTimeout(() => setCopiedAttendance(false), 2000);
  };

  // If no poll exists and user is presenter/host
  if (!activePoll && !isCreating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-adobe-muted select-none text-xs" dir="rtl">
        <BarChart2 className="w-10 h-10 mb-2 opacity-40 text-adobe-border" />
        <p className="mb-3 font-medium">نظرسنجی یا حضور و غیاب فعالی وجود ندارد</p>
        {isPresenterOrHost ? (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-adobe-accent hover:bg-blue-600 text-white rounded font-semibold transition shadow-md"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ایجاد نظرسنجی / حضور و غیاب</span>
          </button>
        ) : (
          <span className="italic text-[11px]">در انتظار شروع نظرسنجی یا ثبت حضور توسط استاد...</span>
        )}
      </div>
    );
  }

  // Poll Creation Form
  if (isCreating) {
    return (
      <form onSubmit={handleCreatePoll} className="flex-1 p-3 overflow-y-auto text-xs flex flex-col gap-2.5" dir="rtl">
        <div className="flex items-center justify-between border-b border-adobe-border pb-1.5 mb-1">
          <h4 className="font-bold text-white">ایجاد نظرسنجی یا حضور و غیاب جدید</h4>
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="text-adobe-muted hover:text-white text-xs"
          >
            انصراف
          </button>
        </div>

        <div>
          <label className="block text-[11px] text-adobe-muted mb-1 font-semibold">
            عنوان یا پرسش:
          </label>
          <input
            type="text"
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={pollType === "attendance" ? "حضور و غیاب جلسه آنلاین" : "مثال: کدام موضوع برای تمرین بعدی مناسب‌تر است؟"}
            className="w-full bg-adobe-bar border border-adobe-border rounded px-2.5 py-1.5 text-white placeholder-adobe-muted focus:outline-none focus:border-adobe-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-adobe-muted mb-1 font-semibold">نوع نظرسنجی:</label>
            <select
              value={pollType}
              onChange={(e) => {
                const nextType = e.target.value as any;
                setPollType(nextType);
                if (nextType === "attendance" && !question) {
                  setQuestion("حضور و غیاب کلاسی");
                }
              }}
              className="w-full bg-adobe-bar border border-adobe-border rounded px-2 py-1.5 text-white"
            >
              <option value="single">چند گزینه‌ای (تک پاسخی)</option>
              <option value="multiple">چند گزینه‌ای (چند پاسخی)</option>
              <option value="text">پاسخ تشریحی / کوتاه</option>
              <option value="attendance">حضور و غیاب (ثبت نام و زمان)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-adobe-muted mb-1 font-semibold">حالت ثبت آرا:</label>
            <select
              disabled={pollType === "attendance"}
              value={isAnonymous ? "anonymous" : "identified"}
              onChange={(e) => setIsAnonymous(e.target.value === "anonymous")}
              className="w-full bg-adobe-bar border border-adobe-border rounded px-2 py-1.5 text-white disabled:opacity-50"
            >
              <option value="identified">غیرناشناس (نمایش اسامی برای استاد)</option>
              <option value="anonymous">کاملاً ناشناس (بدون ثبت نام)</option>
            </select>
          </div>
        </div>

        {pollType === "attendance" && (
          <div className="p-2.5 bg-blue-950/40 border border-blue-800 rounded-lg text-blue-200 text-[11px] flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>در حالت حضور و غیاب، دانشجویان با زدن کلید «حاضرم»، نام و زمان دقیق ورودشان ثبت می‌شود.</span>
          </div>
        )}

        {pollType !== "text" && pollType !== "attendance" && (
          <div className="space-y-1.5">
            <label className="block text-[11px] text-adobe-muted font-semibold">گزینه‌های پاسخ:</label>
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <input
                  type="text"
                  required
                  value={opt}
                  onChange={(e) => {
                    const copy = [...options];
                    copy[idx] = e.target.value;
                    setOptions(copy);
                  }}
                  className="flex-1 bg-adobe-bar border border-adobe-border rounded px-2 py-1 text-white"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setOptions(options.filter((_, i) => i !== idx))}
                    className="p-1 text-rose-400 hover:text-white"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setOptions([...options, `گزینه ${options.length + 1}`])}
              className="text-[11px] text-adobe-accent hover:underline flex items-center gap-1 mt-1"
            >
              <Plus className="w-3 h-3" /> افزودن گزینه
            </button>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-adobe-border">
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="px-3 py-1.5 rounded bg-adobe-bar text-adobe-muted hover:text-white"
          >
            انصراف
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 bg-adobe-accent hover:bg-blue-600 text-white rounded font-bold"
          >
            انتشار نظرسنجی
          </button>
        </div>
      </form>
    );
  }

  // Active Poll View
  const totalVotes = activePoll.options.reduce((acc, opt) => acc + opt.votes.length, 0);
  const myVoteOptionIds = activePoll.options
    .filter((opt) => currentUser && opt.votes.includes(currentUser.id))
    .map((o) => o.id);
  const hasVoted = myVoteOptionIds.length > 0 || (activePoll.textAnswers && currentUser && activePoll.textAnswers.some((a) => a.userId === currentUser.id));

  return (
    <div className="flex-1 p-3 overflow-y-auto text-xs flex flex-col justify-between" dir="rtl">
      <div>
        {/* Header & Controls */}
        <div className="flex items-start justify-between gap-2 border-b border-adobe-border pb-2 mb-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white text-xs">{activePoll.question}</span>
              {activePoll.type === "attendance" ? (
                <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[9px] font-bold">
                  حضور و غیاب
                </span>
              ) : activePoll.isAnonymous ? (
                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[9px]">
                  ناشناس
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-[9px]">
                  شناسه‌دار
                </span>
              )}
            </div>
            <div className="text-[10px] text-adobe-muted mt-0.5">
              {activePoll.isOpen ? (
                <span className="text-emerald-400">● در حال برگزاری</span>
              ) : (
                <span className="text-rose-400">بسته شده</span>
              )}
              {activePoll.type !== "text" && ` • ${totalVotes} پاسخ ثبت شده`}
            </div>
          </div>

          {isPresenterOrHost && (
            <div className="flex items-center gap-1">
              {activePoll.type === "attendance" && (
                <button
                  onClick={handleCopyAttendance}
                  className="p-1 rounded bg-adobe-bar hover:bg-adobe-border text-adobe-muted hover:text-white"
                  title="کپی لیست حاضرین"
                >
                  {copiedAttendance ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
              <button
                onClick={() => togglePollStatus(!activePoll.isOpen)}
                className={`p-1 rounded ${activePoll.isOpen ? "bg-amber-950/60 text-amber-300 hover:bg-amber-900" : "bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900"}`}
                title={activePoll.isOpen ? "بستن نظرسنجی" : "باز کردن نظرسنجی"}
              >
                <Lock className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => toggleBroadcast(!activePoll.broadcastResults)}
                className={`p-1 rounded ${activePoll.broadcastResults ? "text-emerald-400" : "text-adobe-muted hover:text-white"}`}
                title={activePoll.broadcastResults ? "نتایج برای همه منتشر شده" : "نتایج مخفی است"}
              >
                {activePoll.broadcastResults ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={handleDeletePoll}
                className="p-1 rounded text-rose-400 hover:bg-rose-950/40"
                title="حذف نظرسنجی"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ========================================= */}
        {/* CASE 1: ATTENDANCE CHECK MODE             */}
        {/* ========================================= */}
        {activePoll.type === "attendance" ? (
          <div className="space-y-3">
            {!hasVoted && activePoll.isOpen && (
              <button
                onClick={() => {
                  const optId = activePoll.options[0]?.id;
                  if (optId) {
                    sendMessage({
                      type: "POLL_VOTE",
                      pollId: activePoll.id,
                      optionIds: [optId],
                    });
                  }
                }}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-sm"
              >
                <CheckCircle className="w-5 h-5" />
                <span>ثبت حضور من در کلاس (حاضرم)</span>
              </button>
            )}

            {hasVoted && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-emerald-200 text-center font-bold text-xs flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>حضور شما با موفقیت ثبت شد.</span>
              </div>
            )}

            {/* Attendance List (For Host) */}
            {isPresenterOrHost && (
              <div className="mt-3 bg-adobe-bar/60 border border-adobe-border rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-white border-b border-adobe-border/60 pb-1">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-blue-400" />
                    <span>لیست حاضرین کلاس ({activePoll.options[0]?.voterDetails?.length || 0} نفر)</span>
                  </span>
                  <button
                    onClick={handleCopyAttendance}
                    className="text-[10px] text-adobe-accent hover:underline flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedAttendance ? "کپی شد" : "کپی لیست"}</span>
                  </button>
                </div>

                <div className="max-h-36 overflow-y-auto divide-y divide-adobe-border/30">
                  {(activePoll.options[0]?.voterDetails || []).map((attendee, idx) => (
                    <div key={attendee.userId} className="flex items-center justify-between py-1 text-[11px]">
                      <span className="text-white font-medium">
                        {idx + 1}. {attendee.userName}
                      </span>
                      <span className="text-[10px] text-adobe-muted font-mono flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(attendee.timestamp).toLocaleTimeString("fa-IR")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activePoll.type === "text" ? (
          /* ========================================= */
          /* CASE 2: TEXT ANSWER POLL                  */
          /* ========================================= */
          <div className="space-y-2">
            {activePoll.isOpen && (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  placeholder="پاسخ خود را بنویسید..."
                  className="flex-1 bg-adobe-bar border border-adobe-border rounded px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-adobe-accent"
                />
                <button
                  onClick={handleVote}
                  className="p-1.5 bg-adobe-accent hover:bg-blue-600 text-white rounded"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="mt-2 space-y-1.5 max-h-44 overflow-y-auto">
              {(activePoll.textAnswers || []).map((ans, idx) => (
                <div key={idx} className="p-2 bg-adobe-bar/60 rounded border border-adobe-border">
                  <div className="flex items-center justify-between text-[10px] text-adobe-muted mb-0.5">
                    <span>{activePoll.isAnonymous ? "دانشجو" : ans.userName}</span>
                    {ans.timestamp && <span>{new Date(ans.timestamp).toLocaleTimeString("fa-IR")}</span>}
                  </div>
                  <div className="text-white text-xs">{ans.answer}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ========================================= */
          /* CASE 3: SINGLE / MULTIPLE CHOICE POLL     */
          /* ========================================= */
          <div className="space-y-2">
            {activePoll.options.map((opt) => {
              const voteCount = opt.votes.length;
              const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
              const isSelected = selectedOptions.includes(opt.id) || myVoteOptionIds.includes(opt.id);
              const showVoterDetails = isPresenterOrHost && !activePoll.isAnonymous && expandedOptionDetails[opt.id];

              return (
                <div key={opt.id} className="space-y-1">
                  <div
                    onClick={() => {
                      if (!activePoll.isOpen) return;
                      if (activePoll.type === "single") {
                        setSelectedOptions([opt.id]);
                      } else {
                        setSelectedOptions(
                          selectedOptions.includes(opt.id)
                            ? selectedOptions.filter((id) => id !== opt.id)
                            : [...selectedOptions, opt.id]
                        );
                      }
                    }}
                    className={`relative p-2 rounded-lg border transition cursor-pointer overflow-hidden ${
                      isSelected
                        ? "bg-adobe-border/60 border-adobe-accent"
                        : "bg-adobe-bar/60 border-adobe-border hover:bg-adobe-border/40"
                    }`}
                  >
                    {/* Background Progress Fill */}
                    {(activePoll.broadcastResults || isPresenterOrHost) && (
                      <div
                        style={{ width: `${percent}%` }}
                        className="absolute top-0 right-0 bottom-0 bg-blue-600/20 pointer-events-none transition-all duration-300"
                      />
                    )}

                    <div className="relative flex items-center justify-between text-xs z-10">
                      <div className="flex items-center gap-2">
                        <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] ${
                          isSelected ? "bg-adobe-accent border-adobe-accent text-white" : "border-adobe-muted"
                        }`}>
                          {isSelected && "✓"}
                        </span>
                        <span className="font-medium text-white">{opt.text}</span>
                      </div>

                      {(activePoll.broadcastResults || isPresenterOrHost) && (
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className="text-adobe-muted">({voteCount})</span>
                          <span className="font-bold text-white">{percent}٪</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Voters List for Host if non-anonymous */}
                  {isPresenterOrHost && !activePoll.isAnonymous && opt.voterDetails && opt.voterDetails.length > 0 && (
                    <div className="px-1">
                      <button
                        onClick={() =>
                          setExpandedOptionDetails((prev) => ({ ...prev, [opt.id]: !prev[opt.id] }))
                        }
                        className="text-[10px] text-adobe-accent hover:underline flex items-center gap-0.5"
                      >
                        {showVoterDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        <span>اسامی رای‌دهندگان ({opt.voterDetails.length} نفر)</span>
                      </button>

                      {showVoterDetails && (
                        <div className="mt-1 p-2 bg-black/40 rounded border border-adobe-border text-[10px] space-y-0.5">
                          {opt.voterDetails.map((v) => (
                            <div key={v.userId} className="text-adobe-text">
                              • {v.userName}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {activePoll.isOpen && selectedOptions.length > 0 && (
              <button
                onClick={handleVote}
                className="w-full mt-2 py-1.5 bg-adobe-accent hover:bg-blue-600 text-white font-bold rounded shadow transition"
              >
                ثبت رای من
              </button>
            )}
          </div>
        )}
      </div>

      {isPresenterOrHost && (
        <button
          onClick={() => setIsCreating(true)}
          className="mt-3 w-full py-1.5 border border-dashed border-adobe-border hover:border-adobe-accent text-adobe-muted hover:text-white rounded transition text-center"
        >
          + ایجاد نظرسنجی یا حضور و غیاب جدید
        </button>
      )}
    </div>
  );
};
