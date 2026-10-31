import React, { useState, useEffect, useRef } from "react";
import { FileText, Download, Check } from "lucide-react";
import { useRoomStore } from "../../stores/roomStore";
import { WSMessage } from "../../types";

interface NotesPodProps {
  sendMessage: (msg: WSMessage) => void;
}

export const NotesPod: React.FC<NotesPodProps> = ({ sendMessage }) => {
  const { roomState, currentUser } = useRoomStore();
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(true);
  const debounceTimerRef = useRef<number | null>(null);

  const canEdit =
    currentUser?.role === "host" ||
    currentUser?.role === "presenter" ||
    currentUser?.permissions.canDraw; // drawing/collaboration right

  useEffect(() => {
    if (roomState?.notesContent !== undefined) {
      setContent(roomState.notesContent);
    }
  }, [roomState?.notesContent]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setContent(newText);
    setSaved(false);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      const v = (roomState?.notesVersion || 1) + 1;
      sendMessage({ type: "NOTE_UPDATE", content: newText, version: v });
      useRoomStore.getState().setNotes(newText, v);
      setSaved(true);
    }, 400);
  };

  const handleExport = () => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `meeting-notes-${Date.now()}.txt`;
    link.click();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden text-xs">
      {/* Notes Sub-bar */}
      <div className="h-7 bg-adobe-bar border-b border-adobe-border px-2.5 flex items-center justify-between text-adobe-muted select-none">
        <div className="flex items-center gap-1.5 text-[11px]">
          {saved ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <Check className="w-3 h-3" />
              <span>Synced</span>
            </span>
          ) : (
            <span className="text-amber-400">Saving...</span>
          )}
        </div>

        <button
          onClick={handleExport}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-adobe-pod hover:text-white transition text-[11px]"
          title="Export Notes as text file"
        >
          <Download className="w-3 h-3" />
          <span>Export</span>
        </button>
      </div>

      {/* Textarea Area */}
      <textarea
        value={content}
        onChange={handleChange}
        disabled={!canEdit}
        placeholder={canEdit ? "Type collaborative meeting notes here..." : "Viewing notes..."}
        className="flex-1 w-full bg-adobe-pod/30 p-3 text-white placeholder-adobe-muted text-xs leading-relaxed resize-none focus:outline-none"
      />
    </div>
  );
};
