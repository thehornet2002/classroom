import React, { useRef, useState, useEffect } from "react";
import {
  Pen,
  Highlighter,
  Minus,
  ArrowRight,
  Square,
  Circle,
  Type,
  Eraser,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Palette,
} from "lucide-react";
import { useRoomStore } from "../../../stores/roomStore";
import { WhiteboardStroke, WSMessage } from "../../../types";
import { webrtc } from "../../../lib/webrtc";

interface WhiteboardCanvasProps {
  sendMessage: (msg: WSMessage) => void;
}

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({ sendMessage }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { roomState, currentUser } = useRoomStore();

  const [currentTool, setCurrentTool] = useState<WhiteboardStroke["tool"]>("pen");
  const [currentColor, setCurrentColor] = useState("#3b82f6");
  const [currentSize, setCurrentSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const currentStrokePoints = useRef<{ x: number; y: number }[]>([]);
  const startPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const currentPage = roomState?.whiteboardPage || 1;
  const canDraw = currentUser?.permissions.canDraw || currentUser?.role === "host";
  const strokes = (roomState?.whiteboardStrokes || []).filter((s) => s.pageId === currentPage);

  // Redraw all strokes on canvas
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

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
        // Arrow head
        const angle = Math.atan2(ey - sy, ex - sx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 12 * Math.cos(angle - Math.PI / 6), ey - 12 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(ex - 12 * Math.cos(angle + Math.PI / 6), ey - 12 * Math.sin(angle + Math.PI / 6));
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
      } else if (stroke.tool === "text" && stroke.start && stroke.text) {
        ctx.font = `${Math.max(14, stroke.size * 5)}px sans-serif`;
        ctx.fillText(stroke.text, stroke.start.x * canvas.width, stroke.start.y * canvas.height);
      }

      ctx.restore();
    }
  };

  useEffect(() => {
    renderCanvas();
  }, [strokes, currentPage]);

  // Resize canvas to fill parent container
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      renderCanvas();
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canDraw) return;
    const pt = getCanvasCoords(e);
    setIsDrawing(true);
    startPointRef.current = pt;
    currentStrokePoints.current = [pt];

    if (currentTool === "text") {
      const text = prompt("Enter text for whiteboard:");
      if (text && currentUser) {
        const stroke: WhiteboardStroke = {
          id: crypto.randomUUID(),
          userId: currentUser.id,
          pageId: currentPage,
          tool: "text",
          color: currentColor,
          size: currentSize,
          start: pt,
          text,
        };
        webrtc.sendRealtimeData({ type: "WHITEBOARD_STROKE", stroke });
        sendMessage({ type: "WHITEBOARD_STROKE", stroke });
        useRoomStore.getState().addWhiteboardStroke(stroke);
      }
      setIsDrawing(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canDraw) return;
    const pt = getCanvasCoords(e);

    if (currentTool === "pen" || currentTool === "highlighter" || currentTool === "eraser") {
      currentStrokePoints.current.push(pt);

      // Render live feedback on local canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const pts = currentStrokePoints.current;
      if (pts.length > 1) {
        ctx.save();
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentSize;
        ctx.lineCap = "round";
        if (currentTool === "highlighter") ctx.globalAlpha = 0.35;
        if (currentTool === "eraser") ctx.globalCompositeOperation = "destination-out";

        ctx.beginPath();
        ctx.moveTo(pts[pts.length - 2].x * canvas.width, pts[pts.length - 2].y * canvas.height);
        ctx.lineTo(pts[pts.length - 1].x * canvas.width, pts[pts.length - 1].y * canvas.height);
        ctx.stroke();
        ctx.restore();
      }
    } else if (
      currentTool === "line" ||
      currentTool === "arrow" ||
      currentTool === "rect" ||
      currentTool === "circle"
    ) {
      renderCanvas();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const start = startPointRef.current;
      ctx.save();
      ctx.strokeStyle = currentColor;
      ctx.fillStyle = currentColor;
      ctx.lineWidth = currentSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const sx = start.x * canvas.width;
      const sy = start.y * canvas.height;
      const ex = pt.x * canvas.width;
      const ey = pt.y * canvas.height;

      if (currentTool === "line") {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      } else if (currentTool === "arrow") {
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
      } else if (currentTool === "rect") {
        ctx.strokeRect(sx, sy, ex - sx, ey - sy);
      } else if (currentTool === "circle") {
        const radius = Math.sqrt(Math.pow(ex - sx, 2) + Math.pow(ey - sy, 2));
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canDraw || !currentUser) return;
    setIsDrawing(false);
    const endPt = getCanvasCoords(e);

    const stroke: WhiteboardStroke = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      pageId: currentPage,
      tool: currentTool,
      color: currentColor,
      size: currentSize,
      start: startPointRef.current,
      end: endPt,
      points: currentStrokePoints.current,
    };

    webrtc.sendRealtimeData({ type: "WHITEBOARD_STROKE", stroke });
    sendMessage({ type: "WHITEBOARD_STROKE", stroke });
    useRoomStore.getState().addWhiteboardStroke(stroke);
    currentStrokePoints.current = [];
  };

  const handleClear = () => {
    if (!canDraw) return;
    if (confirm("صفحه تخته پاک شود؟")) {
      webrtc.sendRealtimeData({ type: "WHITEBOARD_CLEAR", pageId: currentPage });
      sendMessage({ type: "WHITEBOARD_CLEAR", pageId: currentPage });
      useRoomStore.getState().clearWhiteboard(currentPage);
    }
  };

  const colors = ["#ffffff", "#3b82f6", "#10b981", "#eab308", "#ef4444", "#a855f7"];

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-900 select-none overflow-hidden relative">
      {/* Floating Whiteboard Toolbar */}
      {canDraw && (
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-adobe-bar/90 backdrop-blur border border-adobe-border p-1 rounded-lg shadow-lg text-xs">
          {/* Tool selectors */}
          <button
            onClick={() => setCurrentTool("pen")}
            className={`p-1.5 rounded ${
              currentTool === "pen" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"
            }`}
            title="Pen"
          >
            <Pen className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setCurrentTool("highlighter")}
            className={`p-1.5 rounded ${
              currentTool === "highlighter" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"
            }`}
            title="Highlighter"
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setCurrentTool("line")}
            className={`p-1.5 rounded ${
              currentTool === "line" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"
            }`}
            title="Line"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setCurrentTool("arrow")}
            className={`p-1.5 rounded ${
              currentTool === "arrow" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"
            }`}
            title="Arrow"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setCurrentTool("rect")}
            className={`p-1.5 rounded ${
              currentTool === "rect" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"
            }`}
            title="Rectangle"
          >
            <Square className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setCurrentTool("circle")}
            className={`p-1.5 rounded ${
              currentTool === "circle" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"
            }`}
            title="Circle"
          >
            <Circle className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setCurrentTool("text")}
            className={`p-1.5 rounded ${
              currentTool === "text" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"
            }`}
            title="Text"
          >
            <Type className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setCurrentTool("eraser")}
            className={`p-1.5 rounded ${
              currentTool === "eraser" ? "bg-adobe-accent text-white" : "text-adobe-muted hover:text-white"
            }`}
            title="Eraser"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-adobe-border mx-1" />

          {/* Color palette */}
          <div className="flex items-center gap-1">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setCurrentColor(c)}
                style={{ backgroundColor: c }}
                className={`w-3.5 h-3.5 rounded-full border ${
                  currentColor === c ? "border-white ring-1 ring-white" : "border-transparent"
                }`}
              />
            ))}
          </div>

          <div className="w-[1px] h-4 bg-adobe-border mx-1" />

          {/* Stroke Size */}
          <select
            value={currentSize}
            onChange={(e) => setCurrentSize(Number(e.target.value))}
            className="bg-adobe-pod border border-adobe-border rounded px-1 text-[11px] text-white"
          >
            <option value={2}>Thin</option>
            <option value={4}>Medium</option>
            <option value={8}>Thick</option>
          </select>

          <div className="w-[1px] h-4 bg-adobe-border mx-1" />

          {/* Clear Button */}
          <button
            onClick={handleClear}
            className="p-1.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/50"
            title="Clear Page"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Canvas Area */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`w-full h-full bg-[#181a20] ${canDraw ? "cursor-crosshair" : "cursor-default"}`}
      />

      {/* Bottom Page Navigation (Adobe Connect style multi-page whiteboard) */}
      <div className="absolute bottom-2 right-2 flex items-center gap-2 bg-adobe-bar/90 backdrop-blur border border-adobe-border px-2 py-1 rounded-md text-xs z-20">
        <button
          onClick={() => {
            if (currentPage > 1) {
              const p = currentPage - 1;
              sendMessage({ type: "WHITEBOARD_PAGE_CHANGE", pageId: p });
              useRoomStore.getState().setWhiteboardPage(p);
            }
          }}
          disabled={currentPage <= 1}
          className="p-1 disabled:opacity-40 hover:text-white"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="font-semibold text-adobe-muted text-[11px]">
          Page {currentPage}
        </span>
        <button
          onClick={() => {
            const p = currentPage + 1;
            sendMessage({ type: "WHITEBOARD_PAGE_CHANGE", pageId: p });
            useRoomStore.getState().setWhiteboardPage(p);
          }}
          className="p-1 hover:text-white"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
