import React, { useState } from "react";
import { FileUp, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, FileText } from "lucide-react";
import { useRoomStore } from "../../../stores/roomStore";
import { WSMessage } from "../../../types";

interface DocumentViewerProps {
  sendMessage: (msg: WSMessage) => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ sendMessage }) => {
  const { roomState, currentUser } = useRoomStore();
  const [localDocUrl, setLocalDocUrl] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(5);
  const [zoom, setZoom] = useState<number>(100);

  const isPresenterOrHost =
    currentUser?.role === "host" ||
    currentUser?.role === "presenter" ||
    currentUser?.permissions.canShareDoc;

  const docState = roomState?.documentState;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLocalDocUrl(dataUrl);

      const newDocState = {
        docUrl: dataUrl,
        docName: file.name,
        currentPage: 1,
        totalPages: 10,
        zoom: 100,
      };

      sendMessage({ type: "DOC_CHANGE", docState: newDocState });
    };
    reader.readAsDataURL(file);
  };

  const changePage = (newPage: number) => {
    if (!isPresenterOrHost) return;
    const clamped = Math.max(1, Math.min(totalPages, newPage));
    setCurrentPage(clamped);
    sendMessage({ type: "DOC_PAGE_CHANGE", page: clamped, zoom });
  };

  const activeDocName = docState?.docName || "Sample Presentation.pdf";
  const activePage = docState?.currentPage || currentPage;

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 select-none overflow-hidden text-xs">
      {/* Top Document Control Bar */}
      <div className="h-9 bg-adobe-bar border-b border-adobe-border px-3 flex items-center justify-between">
        <div className="flex items-center gap-2 truncate">
          <FileText className="w-4 h-4 text-adobe-accent flex-shrink-0" />
          <span className="font-semibold text-white truncate max-w-xs">
            {activeDocName}
          </span>
        </div>

        {/* Presentation Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom */}
          <div className="flex items-center gap-1 text-adobe-muted">
            <button
              onClick={() => setZoom(Math.max(50, zoom - 10))}
              className="p-1 hover:text-white"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] w-10 text-center">{zoom}%</span>
            <button
              onClick={() => setZoom(Math.min(200, zoom + 10))}
              className="p-1 hover:text-white"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-[1px] h-4 bg-adobe-border" />

          {/* Page Turner */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => changePage(activePage - 1)}
              disabled={!isPresenterOrHost || activePage <= 1}
              className="p-1 disabled:opacity-30 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] text-adobe-text font-medium">
              Page {activePage} of {totalPages}
            </span>
            <button
              onClick={() => changePage(activePage + 1)}
              disabled={!isPresenterOrHost || activePage >= totalPages}
              className="p-1 disabled:opacity-30 hover:text-white"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Upload Button */}
          {isPresenterOrHost && (
            <label className="ml-2 flex items-center gap-1 bg-adobe-pod border border-adobe-border hover:bg-adobe-border px-2 py-1 rounded cursor-pointer text-[11px] font-medium text-white transition">
              <FileUp className="w-3.5 h-3.5" />
              <span>Share PDF</span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Document Slide Viewer Canvas */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-zinc-900">
        <div
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: "center center" }}
          className="w-[600px] h-[400px] bg-white text-zinc-900 rounded shadow-2xl p-8 flex flex-col justify-between transition-transform duration-100"
        >
          <div>
            <div className="text-[10px] uppercase font-bold text-blue-600 tracking-wider mb-2">
              Adobe Connect Document Slide {activePage}
            </div>
            <h2 className="text-xl font-bold text-zinc-900 mb-3">
              {docState?.docName || "Introduction to ClassroomFlare"}
            </h2>
            <p className="text-zinc-600 text-sm leading-relaxed">
              This document presentation is synchronized across all connected participants.
              When the presenter turns the page, all attendees automatically follow the active slide.
            </p>
          </div>

          <div className="border-t border-zinc-200 pt-3 flex items-center justify-between text-zinc-400 text-xs">
            <span>ClassroomFlare Presentation Mode</span>
            <span>Slide {activePage} / {totalPages}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
