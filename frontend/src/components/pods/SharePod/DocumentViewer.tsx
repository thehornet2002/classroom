import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  FileUp,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  FileText,
  Lock,
  Unlock,
  Pen,
  Highlighter,
  Minus,
  ArrowRight,
  Square,
  Circle,
  Eraser,
  Trash2,
  Loader2,
  Compass,
} from "lucide-react";
import { useRoomStore } from "../../../stores/roomStore";
import { DocumentStroke, WSMessage } from "../../../types";
import { webrtc } from "../../../lib/webrtc";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.js?url";

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface DocumentViewerProps {
  sendMessage: (msg: WSMessage) => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ sendMessage }) => {
  const { roomState, currentUser } = useRoomStore();

  const isPresenterOrHost =
    currentUser?.role === "host" ||
    currentUser?.role === "presenter" ||
    !!currentUser?.permissions.canShareDoc;

  const docState = roomState?.documentState;

  // Local view state for attendees when in free browse mode
  const [localPage, setLocalPage] = useState<number>(1);
  const [localZoom, setLocalZoom] = useState<number>(100);
  const [isFreeModeAttendee, setIsFreeModeAttendee] = useState<boolean>(false);

  // Upload Progress State
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  // Annotation Drawing Tools
  const [activeTool, setActiveTool] = useState<DocumentStroke["tool"]>("pen");
  const [activeColor, setActiveColor] = useState<string>("#ef4444");
  const [activeSize, setActiveSize] = useState<number>(3);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const drawingPointsRef = useRef<{ x: number; y: number }[]>([]);
  const startPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // DOM Refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const annotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);

  // Determine effective display parameters
  const effectiveSyncMode = docState?.syncMode || "sync";
  const shouldFollowHost = isPresenterOrHost || effectiveSyncMode === "sync" || !isFreeModeAttendee;

  const activePage = shouldFollowHost
    ? (docState?.currentPage || 1)
    : localPage;

  const activeZoom = shouldFollowHost
    ? (docState?.zoom || 100)
    : localZoom;

  const totalPages = docState?.totalPages || 1;

  // Synchronize Host scroll/pan to attendees (attendees cannot scroll in sync mode)
  useEffect(() => {
    if (!isPresenterOrHost && shouldFollowHost && containerRef.current) {
      const container = containerRef.current;
      const maxScrollLeft = container.scrollWidth - container.clientWidth;
      const maxScrollTop = container.scrollHeight - container.clientHeight;
      if (docState?.panX !== undefined && maxScrollLeft > 0) {
        container.scrollLeft = docState.panX * maxScrollLeft;
      }
      if (docState?.panY !== undefined && maxScrollTop > 0) {
        container.scrollTop = docState.panY * maxScrollTop;
      }
    }
  }, [isPresenterOrHost, shouldFollowHost, docState?.panX, docState?.panY, activeZoom]);

  // Load PDF Document when docUrl changes
  useEffect(() => {
    if (!docState?.docUrl) {
      pdfDocRef.current = null;
      return;
    }

    if (docState.docUrl.startsWith("data:application/pdf") || docState.docName?.toLowerCase().endsWith(".pdf")) {
      const loadingTask = pdfjsLib.getDocument(docState.docUrl);
      loadingTask.promise.then(
        (pdf) => {
          pdfDocRef.current = pdf;
          renderCurrentPage(pdf, activePage, activeZoom);
        },
        (error) => {
          console.error("PDF loading error:", error);
        }
      );
    }
  }, [docState?.docUrl]);

  // Render current page when activePage or activeZoom changes
  useEffect(() => {
    if (pdfDocRef.current) {
      renderCurrentPage(pdfDocRef.current, activePage, activeZoom);
    } else {
      drawAnnotations();
    }
  }, [activePage, activeZoom]);

  // Redraw annotations whenever strokes or activePage updates
  useEffect(() => {
    drawAnnotations();
  }, [docState?.strokes, activePage]);

  const renderCurrentPage = async (pdf: any, pageNum: number, zoomLevel: number) => {
    if (!pdf) return;
    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdf.getPage(Math.max(1, Math.min(pdf.numPages, pageNum)));
      const baseViewport = page.getViewport({ scale: 1.0 });

      // Calculate crisp rendering scale based on container width & zoom
      const containerWidth = containerRef.current?.clientWidth || 800;
      const fitScale = (containerWidth - 48) / baseViewport.width;
      const scale = Math.max(0.5, fitScale * (zoomLevel / 100));
      const viewport = page.getViewport({ scale });

      const canvas = pdfCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      // Match annotation canvas to PDF canvas dimensions
      const annotCanvas = annotCanvasRef.current;
      if (annotCanvas) {
        annotCanvas.width = viewport.width;
        annotCanvas.height = viewport.height;
        annotCanvas.style.width = `${viewport.width}px`;
        annotCanvas.style.height = `${viewport.height}px`;
      }

      const renderContext = {
        canvasContext: ctx,
        viewport,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      renderTaskRef.current = null;

      drawAnnotations();
    } catch (e: any) {
      if (e?.name !== "RenderingCancelledException") {
        console.error("Error rendering PDF page:", e);
      }
    }
  };

  // Render annotations on the overlay canvas
  const drawAnnotations = useCallback(() => {
    const canvas = annotCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const strokes = (docState?.strokes || []).filter((s) => s.page === activePage);

    for (const stroke of strokes) {
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (stroke.tool === "highlighter") {
        ctx.globalAlpha = 0.35;
      } else if (stroke.tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
      }

      if ((stroke.tool === "pen" || stroke.tool === "highlighter" || stroke.tool === "eraser") && stroke.points) {
        if (stroke.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height);
          }
          ctx.stroke();
        }
      } else if (stroke.tool === "line" && stroke.start && stroke.end) {
        ctx.beginPath();
        ctx.moveTo(stroke.start.x * canvas.width, stroke.start.y * canvas.height);
        ctx.lineTo(stroke.end.x * canvas.width, stroke.end.y * canvas.height);
        ctx.stroke();
      } else if (stroke.tool === "arrow" && stroke.start && stroke.end) {
        const sx = stroke.start.x * canvas.width;
        const sy = stroke.start.y * canvas.height;
        const ex = stroke.end.x * canvas.width;
        const ey = stroke.end.y * canvas.height;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        const angle = Math.atan2(ey - sy, ex - sx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 14 * Math.cos(angle - Math.PI / 6), ey - 14 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ex - 14 * Math.cos(angle + Math.PI / 6), ey - 14 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (stroke.tool === "rect" && stroke.start && stroke.end) {
        const sx = stroke.start.x * canvas.width;
        const sy = stroke.start.y * canvas.height;
        const w = (stroke.end.x - stroke.start.x) * canvas.width;
        const h = (stroke.end.y - stroke.start.y) * canvas.height;
        ctx.strokeRect(sx, sy, w, h);
      } else if (stroke.tool === "circle" && stroke.start && stroke.end) {
        const sx = stroke.start.x * canvas.width;
        const sy = stroke.start.y * canvas.height;
        const ex = stroke.end.x * canvas.width;
        const ey = stroke.end.y * canvas.height;
        const radius = Math.sqrt(Math.pow(ex - sx, 2) + Math.pow(ey - sy, 2));
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [docState?.strokes, activePage]);

  // Handle file upload with progress bar
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const totalBytes = file.size;
    const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
    setUploadProgress(10);
    setUploadStatus(`در حال خواندن فایل ${file.name} (۰ از ${mbTotal} MB)...`);

    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.min(90, Math.round((event.loaded / event.total) * 100));
        const mbLoaded = (event.loaded / (1024 * 1024)).toFixed(1);
        setUploadProgress(percent);
        setUploadStatus(`در حال بارگذاری و پردازش: ${percent}٪ (${mbLoaded} از ${mbTotal} MB)`);
      }
    };

    reader.onload = async () => {
      setUploadProgress(95);
      setUploadStatus("در حال بارگذاری اولیه صفحات PDF...");

      const dataUrl = reader.result as string;
      let detectedPages = 1;

      if (file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) {
        try {
          const loadingTask = pdfjsLib.getDocument(dataUrl);
          const pdf = await loadingTask.promise;
          detectedPages = pdf.numPages;
        } catch (err) {
          detectedPages = 1;
        }
      }

      setUploadProgress(100);
      setUploadStatus("بارگذاری با موفقیت تکمیل شد!");

      setTimeout(() => {
        setUploadProgress(null);

        const newDocState = {
          docUrl: dataUrl,
          docName: file.name,
          currentPage: 1,
          totalPages: detectedPages,
          zoom: 100,
          panX: 0,
          panY: 0,
          syncMode: "sync" as const,
          strokes: [],
        };

        useRoomStore.getState().setDocumentState(newDocState);
        useRoomStore.getState().setShareMode("document");
        sendMessage({ type: "DOC_CHANGE", docState: newDocState });
        sendMessage({ type: "SET_SHARE_MODE", mode: "document" });
      }, 500);
    };

    reader.readAsDataURL(file);
  };

  // Page Turner: Changes page synchronously for host & updates store
  const changePage = (newPage: number) => {
    const clamped = Math.max(1, Math.min(totalPages, newPage));
    if (isPresenterOrHost) {
      useRoomStore.getState().setDocumentPage(clamped, activeZoom, 0, 0);
      sendMessage({ type: "DOC_PAGE_CHANGE", page: clamped, zoom: activeZoom, panX: 0, panY: 0 });
      webrtc.sendRealtimeData({ type: "DOC_PAGE_CHANGE", page: clamped, zoom: activeZoom, panX: 0, panY: 0 });
    } else {
      setLocalPage(clamped);
    }
  };

  // Zoom control
  const handleZoom = (delta: number) => {
    const nextZoom = Math.max(50, Math.min(250, activeZoom + delta));
    if (isPresenterOrHost) {
      useRoomStore.getState().setDocumentPage(activePage, nextZoom, 0, 0);
      sendMessage({ type: "DOC_PAGE_CHANGE", page: activePage, zoom: nextZoom, panX: 0, panY: 0 });
      webrtc.sendRealtimeData({ type: "DOC_PAGE_CHANGE", page: activePage, zoom: nextZoom, panX: 0, panY: 0 });
    } else {
      setLocalZoom(nextZoom);
    }
  };

  // Host container scroll listener to broadcast pan/zoom focus to attendees
  const handleHostScroll = () => {
    if (!isPresenterOrHost || !containerRef.current) return;
    const container = containerRef.current;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    const maxScrollTop = container.scrollHeight - container.clientHeight;

    const panX = maxScrollLeft > 0 ? container.scrollLeft / maxScrollLeft : 0;
    const panY = maxScrollTop > 0 ? container.scrollTop / maxScrollTop : 0;

    sendMessage({
      type: "DOC_PAGE_CHANGE",
      page: activePage,
      zoom: activeZoom,
      panX,
      panY,
    });
    webrtc.sendRealtimeData({
      type: "DOC_PAGE_CHANGE",
      page: activePage,
      zoom: activeZoom,
      panX,
      panY,
    });
  };

  // Toggle sync mode by Host
  const toggleSyncMode = () => {
    if (!isPresenterOrHost) return;
    const nextMode = effectiveSyncMode === "sync" ? "free" : "sync";
    useRoomStore.getState().setDocumentSyncMode(nextMode);
    sendMessage({ type: "DOC_SYNC_MODE", syncMode: nextMode });
  };

  // Drawing Coordinate Helpers
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = annotCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPresenterOrHost) return;
    const pt = getCanvasCoords(e);
    setIsDrawing(true);
    startPointRef.current = pt;
    drawingPointsRef.current = [pt];
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isPresenterOrHost) return;
    const pt = getCanvasCoords(e);

    const canvas = annotCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (activeTool === "pen" || activeTool === "highlighter" || activeTool === "eraser") {
      drawingPointsRef.current.push(pt);
      const pts = drawingPointsRef.current;
      if (pts.length > 1) {
        ctx.save();
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = activeSize;
        ctx.lineCap = "round";
        if (activeTool === "highlighter") ctx.globalAlpha = 0.35;
        if (activeTool === "eraser") ctx.globalCompositeOperation = "destination-out";

        ctx.beginPath();
        ctx.moveTo(pts[pts.length - 2].x * canvas.width, pts[pts.length - 2].y * canvas.height);
        ctx.lineTo(pts[pts.length - 1].x * canvas.width, pts[pts.length - 1].y * canvas.height);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Live shape preview during drag
      drawAnnotations();
      const start = startPointRef.current;
      ctx.save();
      ctx.strokeStyle = activeColor;
      ctx.fillStyle = activeColor;
      ctx.lineWidth = activeSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const sx = start.x * canvas.width;
      const sy = start.y * canvas.height;
      const ex = pt.x * canvas.width;
      const ey = pt.y * canvas.height;

      if (activeTool === "line") {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      } else if (activeTool === "arrow") {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        const angle = Math.atan2(ey - sy, ex - sx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 14 * Math.cos(angle - Math.PI / 6), ey - 14 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ex - 14 * Math.cos(angle + Math.PI / 6), ey - 14 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (activeTool === "rect") {
        ctx.strokeRect(sx, sy, ex - sx, ey - sy);
      } else if (activeTool === "circle") {
        const radius = Math.sqrt(Math.pow(ex - sx, 2) + Math.pow(ey - sy, 2));
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isPresenterOrHost || !currentUser) return;
    setIsDrawing(false);
    const endPt = getCanvasCoords(e);

    const stroke: DocumentStroke = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      page: activePage,
      tool: activeTool,
      color: activeColor,
      size: activeSize,
      start: startPointRef.current,
      end: endPt,
      points: [...drawingPointsRef.current],
    };

    useRoomStore.getState().addDocumentStroke(stroke);
    sendMessage({ type: "DOC_STROKE", stroke });
    webrtc.sendRealtimeData({ type: "DOC_STROKE", stroke });
    drawingPointsRef.current = [];
  };

  const handleClearStrokes = () => {
    if (!isPresenterOrHost) return;
    if (confirm("آیا یادداشت‌های روی این صفحه پاک شوند؟")) {
      useRoomStore.getState().clearDocumentStrokes(activePage);
      sendMessage({ type: "DOC_CLEAR_STROKES", page: activePage });
      webrtc.sendRealtimeData({ type: "DOC_CLEAR_STROKES", page: activePage });
      drawAnnotations();
    }
  };

  const colors = ["#ef4444", "#3b82f6", "#10b981", "#eab308", "#a855f7", "#ffffff"];

  // Whether user can scroll this container
  // In sync mode, non-hosts CANNOT scroll (overflow is hidden or user interaction blocked)
  const isScrollLocked = !isPresenterOrHost && shouldFollowHost;

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 select-none overflow-hidden text-xs" dir="rtl">
      {/* Top Document Control Bar */}
      <div className="h-10 bg-adobe-bar border-b border-adobe-border px-3 flex items-center justify-between">
        {/* Document Title & Sync Mode Indicator */}
        <div className="flex items-center gap-2 truncate">
          <FileText className="w-4 h-4 text-adobe-accent flex-shrink-0" />
          <span className="font-semibold text-white truncate max-w-[200px]" title={docState?.docName}>
            {docState?.docName || "سند ارائه"}
          </span>

          {/* Sync Mode Badge */}
          {docState?.docUrl && (
            <div className="flex items-center gap-1.5 mr-2">
              {isPresenterOrHost ? (
                <button
                  onClick={toggleSyncMode}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                    effectiveSyncMode === "sync"
                      ? "bg-blue-950/80 border-blue-600 text-blue-300"
                      : "bg-amber-950/80 border-amber-600 text-amber-300"
                  }`}
                  title="کلیک برای تغییر حالت ارائه همگام یا مطالعه آزاد برای دانشجویان"
                >
                  {effectiveSyncMode === "sync" ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  <span>{effectiveSyncMode === "sync" ? "حالت همگام (قفل صفحه برای کلاس)" : "مطالعه آزاد (Free)"}</span>
                </button>
              ) : (
                <span
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                    shouldFollowHost
                      ? "bg-blue-950/60 border-blue-800 text-blue-300"
                      : "bg-amber-950/60 border-amber-800 text-amber-300"
                  }`}
                >
                  {shouldFollowHost ? <Lock className="w-3 h-3" /> : <Compass className="w-3 h-3" />}
                  <span>{shouldFollowHost ? "همگام با استاد (اسکرول قفل است)" : "مطالعه آزاد"}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Presentation Controls */}
        <div className="flex items-center gap-2" dir="ltr">
          {docState?.docUrl && (
            <>
              {/* Zoom Controls */}
              <div className="flex items-center gap-1 text-adobe-muted">
                <button
                  onClick={() => handleZoom(-15)}
                  disabled={!isPresenterOrHost && shouldFollowHost}
                  className="p-1 hover:text-white disabled:opacity-30"
                  title="کوچک‌نمایی"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] w-9 text-center font-mono font-bold text-white">{activeZoom}%</span>
                <button
                  onClick={() => handleZoom(15)}
                  disabled={!isPresenterOrHost && shouldFollowHost}
                  className="p-1 hover:text-white disabled:opacity-30"
                  title="بزرگ‌نمایی"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="w-[1px] h-4 bg-adobe-border" />

              {/* Page Turner */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => changePage(activePage - 1)}
                  disabled={activePage <= 1 || (!isPresenterOrHost && shouldFollowHost)}
                  className="p-1 disabled:opacity-30 hover:text-white"
                  title="صفحه قبلی"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] text-white font-medium px-1">
                  صفحه {activePage} از {totalPages}
                </span>
                <button
                  onClick={() => changePage(activePage + 1)}
                  disabled={activePage >= totalPages || (!isPresenterOrHost && shouldFollowHost)}
                  className="p-1 disabled:opacity-30 hover:text-white"
                  title="صفحه بعدی"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="w-[1px] h-4 bg-adobe-border" />
            </>
          )}

          {/* Attendee switch between Free Browse and Follow Host */}
          {!isPresenterOrHost && effectiveSyncMode === "free" && (
            <button
              onClick={() => {
                setIsFreeModeAttendee(!isFreeModeAttendee);
                if (isFreeModeAttendee) {
                  setLocalPage(docState?.currentPage || 1);
                  setLocalZoom(docState?.zoom || 100);
                }
              }}
              className="px-2 py-1 rounded bg-adobe-pod border border-adobe-border hover:bg-adobe-border text-[11px] font-medium text-white transition"
            >
              {isFreeModeAttendee ? "🔗 اتصال به صفحه استاد" : "📖 مطالعه مستقل"}
            </button>
          )}

          {/* Upload Button (Host only) */}
          {isPresenterOrHost && (
            <label className="flex items-center gap-1.5 bg-adobe-accent hover:bg-blue-600 text-white px-3 py-1 rounded-md cursor-pointer text-[11px] font-semibold transition shadow-sm">
              <FileUp className="w-3.5 h-3.5" />
              <span>{docState?.docUrl ? "تغییر فایل" : "آپلود فایل PDF / اسلاید"}</span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Annotation Toolbar (Host only) */}
      {isPresenterOrHost && docState?.docUrl && (
        <div className="h-8 bg-adobe-bar/90 border-b border-adobe-border px-3 flex items-center justify-between text-xs select-none">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTool("pen")}
              className={`p-1 rounded ${activeTool === "pen" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"}`}
              title="قلم"
            >
              <Pen className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTool("highlighter")}
              className={`p-1 rounded ${activeTool === "highlighter" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"}`}
              title="هایلایتر"
            >
              <Highlighter className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTool("line")}
              className={`p-1 rounded ${activeTool === "line" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"}`}
              title="خط"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTool("arrow")}
              className={`p-1 rounded ${activeTool === "arrow" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"}`}
              title="فلش"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTool("rect")}
              className={`p-1 rounded ${activeTool === "rect" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"}`}
              title="مستطیل"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTool("circle")}
              className={`p-1 rounded ${activeTool === "circle" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"}`}
              title="دایره"
            >
              <Circle className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveTool("eraser")}
              className={`p-1 rounded ${activeTool === "eraser" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"}`}
              title="پاک‌کن"
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>

            <div className="w-[1px] h-4 bg-adobe-border mx-1" />

            {/* Colors */}
            <div className="flex items-center gap-1">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-3.5 h-3.5 rounded-full border ${activeColor === c ? "border-white ring-1 ring-white" : "border-transparent"}`}
                />
              ))}
            </div>

            <div className="w-[1px] h-4 bg-adobe-border mx-1" />

            {/* Stroke size */}
            <select
              value={activeSize}
              onChange={(e) => setActiveSize(Number(e.target.value))}
              className="bg-adobe-pod border border-adobe-border rounded px-1 text-[10px] text-white"
            >
              <option value={2}>نازک</option>
              <option value={4}>متوسط</option>
              <option value={8}>ضخیم</option>
            </select>
          </div>

          <button
            onClick={handleClearStrokes}
            className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300"
            title="پاک کردن یادداشت‌های این صفحه"
          >
            <Trash2 className="w-3 h-3" />
            <span>پاک کردن یادداشت‌ها</span>
          </button>
        </div>
      )}

      {/* Main Document Canvas Viewport */}
      <div
        ref={containerRef}
        onScroll={handleHostScroll}
        onWheel={(e) => {
          if (isScrollLocked) e.preventDefault();
        }}
        onTouchMove={(e) => {
          if (isScrollLocked) e.preventDefault();
        }}
        className={`flex-1 flex items-start justify-center p-4 bg-zinc-900 relative ${
          isScrollLocked ? "overflow-hidden select-none pointer-events-auto" : "overflow-auto"
        }`}
      >
        {/* Upload Progress View */}
        {uploadProgress !== null ? (
          <div className="flex flex-col items-center justify-center p-8 bg-adobe-pod border border-adobe-border rounded-xl shadow-2xl max-w-sm w-full my-auto">
            <Loader2 className="w-10 h-10 text-adobe-accent animate-spin mb-3" />
            <h4 className="font-bold text-white text-sm mb-1">در حال پردازش سند</h4>
            <p className="text-xs text-adobe-muted mb-4 text-center leading-relaxed">
              {uploadStatus}
            </p>

            <div className="w-full bg-adobe-bar h-3 rounded-full overflow-hidden border border-adobe-border p-0.5">
              <div
                style={{ width: `${uploadProgress}%` }}
                className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 rounded-full transition-all duration-200"
              />
            </div>
            <span className="text-[11px] font-mono font-bold text-white mt-2">
              {uploadProgress}%
            </span>
          </div>
        ) : !docState?.docUrl ? (
          /* Empty placeholder */
          <div className="flex flex-col items-center justify-center text-center p-8 text-adobe-muted max-w-sm my-auto">
            <div className="w-16 h-16 rounded-full bg-adobe-pod border border-adobe-border flex items-center justify-center mb-3 text-adobe-accent">
              <FileText className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">
              هنوز سندی برای ارائه بارگذاری نشده است
            </h3>
            <p className="text-xs text-adobe-muted mb-4 leading-relaxed">
              استاد یا ارائه‌دهنده می‌توانند فایل PDF، جزوه یا اسلایدهای درسی را بارگذاری کنند تا تمام کلاس به صورت همگام مشاهده کنند.
            </p>
            {isPresenterOrHost ? (
              <label className="px-4 py-2 bg-adobe-accent hover:bg-blue-600 text-white font-semibold rounded-lg shadow-md cursor-pointer transition flex items-center gap-2">
                <FileUp className="w-4 h-4" />
                <span>انتخاب فایل PDF یا تصویر</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <span className="text-[11px] italic text-adobe-muted">
                در انتظار بارگذاری سند توسط استاد...
              </span>
            )}
          </div>
        ) : (
          /* Active Document Surface */
          <div className="relative shadow-2xl rounded border border-adobe-border overflow-hidden bg-white">
            {/* Underlying PDF Canvas */}
            <canvas ref={pdfCanvasRef} className="block select-none pointer-events-none" />

            {/* If presentation is an image */}
            {(!docState.docUrl.startsWith("data:application/pdf") && !docState.docName?.toLowerCase().endsWith(".pdf")) && (
              <img
                src={docState.docUrl}
                alt="Document Slide"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  const annotCanvas = annotCanvasRef.current;
                  if (annotCanvas) {
                    annotCanvas.width = img.width;
                    annotCanvas.height = img.height;
                    annotCanvas.style.width = `${img.width}px`;
                    annotCanvas.style.height = `${img.height}px`;
                    drawAnnotations();
                  }
                }}
                className="block max-w-none select-none pointer-events-none"
                style={{ width: `${activeZoom}%`, minWidth: "100%" }}
              />
            )}

            {/* Annotations Overlay Canvas */}
            <canvas
              ref={annotCanvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className={`absolute top-0 left-0 w-full h-full z-10 ${
                isPresenterOrHost ? "cursor-crosshair pointer-events-auto" : "cursor-default pointer-events-none"
              }`}
            />
          </div>
        )}
      </div>
    </div>
  );
};
