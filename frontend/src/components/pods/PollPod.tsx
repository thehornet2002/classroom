import React, { useState } from "react";
import { BarChart2, Plus, CheckCircle, Eye, EyeOff, Trash2, Send, Lock } from "lucide-react";
import { useRoomStore } from "../../stores/roomStore";
import { Poll, WSMessage } from "../../types";

interface PollPodProps {
  sendMessage: (msg: WSMessage) => void;
}

export const PollPod: React.FC<PollPodProps> = ({ sendMessage }) => {
  const { roomState, currentUser } = useRoomStore();
  const [isCreating, setIsCreating] = useState(false);
  const [question, setQuestion] = useState("");
  const [pollType, setPollType] = useState<"single" | "multiple" | "text">("single");
  const [options, setOptions] = useState<string[]>(["Option 1", "Option 2"]);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [textAnswer, setTextAnswer] = useState("");

  const isPresenterOrHost =
    currentUser?.role === "host" || currentUser?.role === "presenter";

  const activePoll = roomState?.activePollId
    ? roomState.polls[roomState.activePollId]
    : Object.values(roomState?.polls || {})[0];

  const handleCreatePoll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    const newPoll: Poll = {
      id: crypto.randomUUID(),
      question: question.trim(),
      type: pollType,
      options:
        pollType === "text"
          ? []
          : options
              .filter((o) => o.trim())
              .map((text) => ({
                id: crypto.randomUUID(),
                text: text.trim(),
                votes: [],
              })),
      textAnswers: [],
      isOpen: true,
      broadcastResults: false,
      createdAt: Date.now(),
    };

    sendMessage({ type: "POLL_CREATE", poll: newPoll });
    useRoomStore.getState().setPoll(newPoll);
    setIsCreating(false);
    setQuestion("");
    setOptions(["Option 1", "Option 2"]);
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

  // If no poll exists and user is presenter/host
  if (!activePoll && !isCreating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-adobe-muted select-none text-xs">
        <BarChart2 className="w-10 h-10 mb-2 opacity-40 text-adobe-border" />
        <p className="mb-3 font-medium">No active polls in this room</p>
        {isPresenterOrHost ? (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-adobe-accent hover:bg-blue-600 text-white rounded font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Poll</span>
          </button>
        ) : (
          <span className="italic text-[11px]">Waiting for presenter to start a poll...</span>
        )}
      </div>
    );
  }

  // Poll Creation Form
  if (isCreating) {
    return (
      <form onSubmit={handleCreatePoll} className="flex-1 p-3 overflow-y-auto text-xs flex flex-col gap-2">
        <h4 className="font-bold text-white mb-1">Create New Poll</h4>

        <div>
          <label className="block text-[11px] text-adobe-muted mb-1">Question:</label>
          <input
            type="text"
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Which topic would you like to review next?"
            className="w-full bg-adobe-bar border border-adobe-border rounded px-2.5 py-1.5 text-white placeholder-adobe-muted focus:outline-none focus:border-adobe-accent"
          />
        </div>

        <div>
          <label className="block text-[11px] text-adobe-muted mb-1">Question Type:</label>
          <select
            value={pollType}
            onChange={(e) => setPollType(e.target.value as any)}
            className="w-full bg-adobe-bar border border-adobe-border rounded px-2 py-1.5 text-white"
          >
            <option value="single">Multiple Choice (Single Answer)</option>
            <option value="multiple">Multiple Choice (Multiple Answers)</option>
            <option value="text">Short Answer (Open Ended)</option>
          </select>
        </div>

        {pollType !== "text" && (
          <div className="space-y-1.5">
            <label className="block text-[11px] text-adobe-muted">Answers:</label>
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
              onClick={() => setOptions([...options, `Option ${options.length + 1}`])}
              className="text-[11px] text-adobe-accent hover:underline flex items-center gap-1 mt-1"
            >
              <Plus className="w-3 h-3" /> Add Option
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 mt-auto pt-2 border-t border-adobe-border">
          <button
            type="submit"
            className="flex-1 py-1.5 rounded bg-adobe-accent hover:bg-blue-600 font-semibold text-white"
          >
            Open Poll
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="px-3 py-1.5 rounded bg-adobe-bar border border-adobe-border text-adobe-muted hover:text-white"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // Active Poll View
  const totalVotes = activePoll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
  const showResults = activePoll.broadcastResults || isPresenterOrHost;
  const myVote = activePoll.options.some((o) => currentUser && o.votes.includes(currentUser.id));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden text-xs">
      {/* Poll Header */}
      <div className="p-2.5 bg-adobe-bar border-b border-adobe-border">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] uppercase font-bold text-adobe-muted tracking-wider">
            {activePoll.isOpen ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Poll Open
              </span>
            ) : (
              <span className="text-rose-400">Poll Closed</span>
            )}
          </span>

          {isPresenterOrHost && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => toggleBroadcast(!activePoll.broadcastResults)}
                title={activePoll.broadcastResults ? "Hide results from participants" : "Broadcast results to participants"}
                className={`p-1 rounded ${
                  activePoll.broadcastResults ? "text-emerald-400 bg-emerald-950/40" : "text-adobe-muted hover:text-white"
                }`}
              >
                {activePoll.broadcastResults ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => togglePollStatus(!activePoll.isOpen)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  activePoll.isOpen
                    ? "bg-rose-950/60 text-rose-300 border border-rose-800"
                    : "bg-emerald-950/60 text-emerald-300 border border-emerald-800"
                }`}
              >
                {activePoll.isOpen ? "Close" : "Re-open"}
              </button>
              <button
                onClick={handleDeletePoll}
                className="p-1 text-adobe-muted hover:text-rose-400"
                title="Delete Poll"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        <h3 className="font-bold text-white text-sm">{activePoll.question}</h3>
      </div>

      {/* Poll Options / Results */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {activePoll.type === "text" ? (
          <div className="space-y-2">
            {activePoll.isOpen && (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  placeholder="Type your answer..."
                  className="flex-1 bg-adobe-bar border border-adobe-border rounded px-2.5 py-1.5 text-white placeholder-adobe-muted focus:outline-none"
                />
                <button
                  onClick={handleVote}
                  className="px-3 py-1.5 bg-adobe-accent text-white rounded font-medium"
                >
                  Submit
                </button>
              </div>
            )}
            <div className="space-y-1.5 mt-3">
              <span className="text-[11px] font-bold text-adobe-muted">
                Answers ({activePoll.textAnswers?.length || 0}):
              </span>
              {(activePoll.textAnswers || []).map((ans, i) => (
                <div key={i} className="bg-adobe-bar/60 p-2 rounded border border-adobe-border text-[11px]">
                  <span className="font-semibold text-adobe-accent">{ans.userName}: </span>
                  <span className="text-white">{ans.answer}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          activePoll.options.map((opt) => {
            const voteCount = opt.votes.length;
            const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
            const isSelected = selectedOptions.includes(opt.id);
            const isVoted = currentUser && opt.votes.includes(currentUser.id);

            return (
              <div
                key={opt.id}
                onClick={() => {
                  if (!activePoll.isOpen) return;
                  if (activePoll.type === "single") {
                    setSelectedOptions([opt.id]);
                  } else {
                    setSelectedOptions(
                      isSelected
                        ? selectedOptions.filter((id) => id !== opt.id)
                        : [...selectedOptions, opt.id]
                    );
                  }
                }}
                className={`p-2 rounded-lg border transition cursor-pointer select-none ${
                  isSelected || isVoted
                    ? "border-adobe-accent bg-adobe-accent/10"
                    : "border-adobe-border bg-adobe-bar/40 hover:bg-adobe-bar/70"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3.5 h-3.5 rounded-${
                        activePoll.type === "single" ? "full" : "sm"
                      } border flex items-center justify-center ${
                        isSelected || isVoted
                          ? "border-adobe-accent bg-adobe-accent"
                          : "border-adobe-border"
                      }`}
                    >
                      {(isSelected || isVoted) && (
                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                      )}
                    </div>
                    <span className="font-medium text-white">{opt.text}</span>
                  </div>

                  {showResults && (
                    <span className="font-bold text-adobe-muted text-[11px]">
                      {percentage}% ({voteCount})
                    </span>
                  )}
                </div>

                {showResults && (
                  <div className="w-full h-1.5 bg-adobe-border rounded-full overflow-hidden mt-1.5">
                    <div
                      style={{ width: `${percentage}%` }}
                      className="h-full bg-adobe-accent transition-all duration-300"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Vote Action Bar */}
      {activePoll.isOpen && activePoll.type !== "text" && (
        <div className="p-2 bg-adobe-bar border-t border-adobe-border flex items-center justify-between">
          <span className="text-[10px] text-adobe-muted">
            {myVote ? "✓ You voted" : "Select an option"}
          </span>
          <button
            onClick={handleVote}
            disabled={selectedOptions.length === 0}
            className="px-3 py-1 bg-adobe-accent hover:bg-blue-600 disabled:opacity-40 text-white rounded font-semibold text-xs transition"
          >
            Vote
          </button>
        </div>
      )}
    </div>
  );
};
