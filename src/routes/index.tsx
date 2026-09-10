import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LiftSense — AI Lift Occupancy Simulator" },
      { name: "description", content: "Upload a lift photo. AI decides whether to stop or skip — watch the animated elevator respond." },
      { property: "og:title", content: "LiftSense — AI Lift Occupancy Simulator" },
      { property: "og:description", content: "AI-powered lift occupancy simulator with animated elevator." },
    ],
  }),
  component: Home,
});

type AnalysisResult = {
  occupancyPercent: number;
  peopleCount: number;
  spaceForOneMore: boolean;
  reasoning: string;
  decision: "STOP" | "SKIP";
  decisionReason: string;
  weight: {
    currentKg: number;
    maxKg: number;
    remainingKg: number;
    loadPercent: number;
    weightAllowsOneMore: boolean;
  };
};

type ElevatorProps = {
  result: AnalysisResult | null;
  floor: number;
  loading: boolean;
};

function ElevatorShaft({ result, floor, loading }: ElevatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  const FLOORS = 10;
  const W = 220;
  const H = 500;
  const SHAFT_X = 65;
  const SHAFT_W = 110;
  const TOP = 20;
  const BOT = 20;
  const usable = H - TOP - BOT;
  const fH = usable / FLOORS;
  const CAB_H = Math.round(fH * 0.82);
  const CAB_W = SHAFT_W - 8;
  const CAB_X = SHAFT_X + 4;

  function floorTop(f: number) { return TOP + (FLOORS - f) * fH; }
  function cabTop(f: number) { return floorTop(f) + (fH - CAB_H) / 2; }

  function drawScene(
    ctx: CanvasRenderingContext2D,
    cabY: number,
    doorOpen: number,
    cabColor: string,
    cabBorder: string,
    calledFloor: number,
    personX: number,
    personVisible: boolean,
    personTurnedAway: boolean,
  ) {
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#f5f5f5";
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(SHAFT_X, TOP, SHAFT_W, usable, 6);
    ctx.fill();
    ctx.stroke();

    for (let f = 1; f <= FLOORS; f++) {
      const y = floorTop(f);
      ctx.strokeStyle = "#e0e0e0";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(SHAFT_X, y);
      ctx.lineTo(SHAFT_X + SHAFT_W, y);
      ctx.stroke();

      ctx.fillStyle = "#999";
      ctx.font = "10px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(String(f), SHAFT_X - 5, y + fH / 2 + 4);
    }

    const cfy = floorTop(calledFloor);
    ctx.fillStyle = "rgba(250,200,50,0.2)";
    ctx.fillRect(SHAFT_X + 1, cfy, SHAFT_W - 2, fH);
    ctx.fillStyle = "#b8860b";
    ctx.font = "9px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("called", SHAFT_X + SHAFT_W + 4, cfy + fH / 2 + 3);

    ctx.fillStyle = cabColor;
    ctx.strokeStyle = cabBorder;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(CAB_X, cabY, CAB_W, CAB_H, 4);
    ctx.fill();
    ctx.stroke();

    const midX = CAB_X + CAB_W / 2;
    const gap = doorOpen * (CAB_W * 0.38);
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(midX - gap, cabY + 3);
    ctx.lineTo(midX - gap, cabY + CAB_H - 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(midX + gap, cabY + 3);
    ctx.lineTo(midX + gap, cabY + CAB_H - 3);
    ctx.stroke();

    ctx.fillStyle = "#666";
    ctx.font = "10px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("▲▼", midX, cabY + CAB_H / 2 + 4);

    if (personVisible) {
      const py = cabY + CAB_H + 2;
      const col = personTurnedAway ? "#e24b4a" : "#2c2c2a";
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 2;
      const s = 0.9;
      ctx.beginPath();
      ctx.arc(personX, py - 18 * s, 5 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(personX, py - 13 * s);
      ctx.lineTo(personX, py - 4 * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(personX, py - 11 * s);
      ctx.lineTo(personX - 7 * s, py - 7 * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(personX, py - 11 * s);
      ctx.lineTo(personX + 7 * s, py - 7 * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(personX, py - 4 * s);
      ctx.lineTo(personX - 5 * s, py + 4 * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(personX, py - 4 * s);
      ctx.lineTo(personX + 5 * s, py + 4 * s);
      ctx.stroke();

      if (personTurnedAway) {
        ctx.fillStyle = "#e24b4a";
        ctx.font = "bold 13px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("✕", personX, py - 32);
      }
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!result) {
      drawScene(ctx, cabTop(1), 0, "#ffffff", "#888888", floor, 15, true, false);
      return;
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const calledF = Math.max(1, Math.min(FLOORS, floor));
    const fromY = cabTop(1);
    const toY = cabTop(calledF);
    const travelDur = Math.max(500, Math.abs(calledF - 1) * 200);

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
    function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

    type Phase = { dur: number; tick: (t: number) => void };
    let phases: Phase[];

    if (result.decision === "STOP") {
      phases = [
        { dur: travelDur, tick: t => drawScene(ctx, lerp(fromY, toY, easeInOut(t)), 0, "#ffffff", "#888888", calledF, 15, true, false) },
        { dur: 50, tick: () => drawScene(ctx, toY, 0, "#e6f5ee", "#1d9e75", calledF, 15, true, false) },
        { dur: 400, tick: t => drawScene(ctx, toY, t, "#e6f5ee", "#1d9e75", calledF, 15, true, false) },
        { dur: 500, tick: t => drawScene(ctx, toY, 1, "#e6f5ee", "#1d9e75", calledF, lerp(15, CAB_X + CAB_W * 0.35, easeInOut(t)), true, false) },
        { dur: 300, tick: () => drawScene(ctx, toY, 1, "#e6f5ee", "#1d9e75", calledF, CAB_X + CAB_W * 0.35, false, false) },
        { dur: 400, tick: t => drawScene(ctx, toY, 1 - t, "#e6f5ee", "#1d9e75", calledF, CAB_X + CAB_W * 0.35, false, false) },
        { dur: 600, tick: t => drawScene(ctx, lerp(toY, cabTop(calledF < FLOORS ? calledF + 1 : calledF - 1), easeInOut(t)), 0, "#ffffff", "#888888", calledF, 15, false, false) },
      ];
    } else {
      const skipF = calledF < FLOORS ? calledF + 1 : calledF - 1;
      phases = [
        { dur: travelDur, tick: t => drawScene(ctx, lerp(fromY, toY, easeInOut(t)), 0, "#ffffff", "#888888", calledF, 15, true, false) },
        { dur: 50, tick: () => drawScene(ctx, toY, 0, "#fcebeb", "#e24b4a", calledF, 15, true, false) },
        { dur: 300, tick: t => drawScene(ctx, toY, 0, "#fcebeb", "#e24b4a", calledF, lerp(15, 8, t), true, true) },
        { dur: 500, tick: () => drawScene(ctx, toY, 0, "#fcebeb", "#e24b4a", calledF, 8, true, true) },
        { dur: 600, tick: t => drawScene(ctx, lerp(toY, cabTop(skipF), easeInOut(t)), 0, "#fcebeb", "#e24b4a", calledF, 8, true, true) },
        { dur: 100, tick: () => drawScene(ctx, cabTop(skipF), 0, "#ffffff", "#888888", calledF, 8, false, false) },
      ];
    }

    let pi = 0;
    let phaseStart: number | null = null;

    function step(ts: number) {
      if (pi >= phases.length) return;
      const ph = phases[pi];
      if (!phaseStart) phaseStart = ts;
      const raw = Math.min((ts - phaseStart) / ph.dur, 1);
      ph.tick(raw);
      if (raw < 1) { rafRef.current = requestAnimationFrame(step); }
      else { pi++; phaseStart = null; rafRef.current = requestAnimationFrame(step); }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [result, floor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || result) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawScene(ctx, cabTop(1), 0, "#ffffff", "#888888", floor, 15, true, false);
  }, [floor]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {result && (
        <div className={`px-5 py-4 ${result.decision === "STOP" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive"}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest opacity-70">Decision · Floor {floor}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight">
                {result.decision === "STOP" ? "STOP — room available" : "SKIP — lift is full"}
              </p>
            </div>
            <div className="font-mono text-3xl">{result.decision === "STOP" ? "▲" : "✕"}</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="px-5 py-4 flex items-center gap-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <p className="text-sm text-muted-foreground">Scanning lift interior…</p>
        </div>
      )}

      {!result && !loading && (
        <div className="px-5 py-4 text-sm text-muted-foreground">
          Run an analysis to see the lift respond at floor <span className="font-medium text-foreground">{floor}</span>.
        </div>
      )}

      <div className="flex justify-center py-3">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ display: "block", borderRadius: "8px", border: "1px solid #e5e5e5" }}
        />
      </div>

      {result && (
        <div className="space-y-3 border-t border-border px-5 pb-5 pt-3">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Visual occupancy</span>
              <span className="text-sm font-semibold tabular-nums">{result.occupancyPercent}%</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full transition-all ${result.occupancyPercent > 90 ? "bg-destructive" : result.occupancyPercent > 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${result.occupancyPercent}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">People</p>
              <p className="text-sm font-semibold">{result.peopleCount}</p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Room for one more</p>
              <p className="text-sm font-semibold">{result.spaceForOneMore ? "Yes" : "No"}</p>
            </div>
          </div>
          <div className="rounded-md bg-muted/60 p-3 text-xs leading-relaxed">
            <span className="font-semibold uppercase tracking-widest text-muted-foreground">AI · </span>
            {result.reasoning}
          </div>
          <div className="rounded-md border border-border bg-background p-3 text-xs leading-relaxed">
            <span className="font-semibold uppercase tracking-widest text-muted-foreground">Controller · </span>
            {result.decisionReason}
          </div>
        </div>
      )}
    </div>
  );
}

function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestedFloor, setRequestedFloor] = useState(7);
  const [cameraOn, setCameraOn] = useState(false);
  const [currentWeightKg, setCurrentWeightKg] = useState(280);
  const [maxCapacityKg, setMaxCapacityKg] = useState(630);
  const [avgPersonKg, setAvgPersonKg] = useState(70);
  const [liveMode, setLiveMode] = useState(false);
  const [intervalSec, setIntervalSec] = useState(4);
  const inFlightRef = useRef(false);

  useEffect(() => { return () => stopCamera(); }, []); // eslint-disable-line

  useEffect(() => {
    if (!liveMode || !cameraOn) return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      if (cancelled || inFlightRef.current) return;
      const url = captureFrameDataUrl();
      if (!url) return;
      setImageDataUrl(url);
      inFlightRef.current = true;
      try { await analyzeWithImage(url); } finally { inFlightRef.current = false; }
    }, Math.max(1, intervalSec) * 1000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [liveMode, cameraOn, intervalSec, currentWeightKg, maxCapacityKg, avgPersonKg]); // eslint-disable-line

  function captureFrameDataUrl(): string | null {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const maxDim = 1024;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  }

  async function analyzeWithImage(url: string) {
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: url, currentWeightKg, maxCapacityKg, avgPersonKg }),
      });
      if (!res.ok) { const err = (await res.json().catch(() => ({}))) as { error?: string }; toast.error(err.error ?? `Analysis failed (${res.status})`); return; }
      setResult((await res.json()) as AnalysisResult);
    } catch { toast.error("Network error. Please try again."); }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null; setCameraOn(false); setLiveMode(false);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream; setCameraOn(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } }, 50);
    } catch { toast.error("Couldn't access camera. You can upload a photo instead."); }
  }

  function snap() {
    const video = videoRef.current; if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setImageDataUrl(canvas.toDataURL("image/jpeg", 0.85)); setResult(null); stopCamera();
  }

  async function handleFile(file: File) {
    if (file.size > 8 * 1024 * 1024) { toast.error("Image is too large. Please use one under 8 MB."); return; }
    setImageDataUrl(await downscaleToDataUrl(file, 1024)); setResult(null);
  }

  async function analyze() {
    if (!imageDataUrl) { toast.error("Upload or snap a photo first."); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, currentWeightKg, maxCapacityKg, avgPersonKg }),
      });
      if (!res.ok) { const err = (await res.json().catch(() => ({}))) as { error?: string }; toast.error(err.error ?? `Analysis failed (${res.status})`); return; }
      setResult((await res.json()) as AnalysisResult);
    } catch { toast.error("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground font-mono text-sm font-bold">▲▼</div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">LiftSense</h1>
              <p className="text-xs text-muted-foreground">AI lift occupancy simulator</p>
            </div>
          </div>
          <span className="hidden text-xs uppercase tracking-widest text-muted-foreground sm:inline">Concept demo</span>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Should the lift stop, or skip this floor?</h2>
          <p className="mt-3 text-muted-foreground">Upload or snap a photo of a lift interior. The AI estimates how full it is — then watch the animated lift respond, with a stick figure boarding or being turned away.</p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-medium">Lift interior</h3>
                <div className="flex gap-2">
                  <button onClick={() => fileInputRef.current?.click()} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-accent">Upload</button>
                  <button onClick={() => cameraInputRef.current?.click()} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-accent sm:hidden">Camera</button>
                  <button onClick={cameraOn ? stopCamera : startCamera} className="hidden rounded-md border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-accent sm:inline-block">{cameraOn ? "Stop camera" : "Use webcam"}</button>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />

              <div className="aspect-[4/3] w-full bg-muted/40">
                {cameraOn ? (
                  <div className="relative h-full w-full">
                    <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
                    {liveMode && (
                      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" /></span>
                        LIVE · every {intervalSec}s
                      </div>
                    )}
                    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
                      <button onClick={snap} className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-lg">Capture</button>
                      <button onClick={() => setLiveMode(v => !v)} className={`rounded-full px-4 py-2 text-sm font-medium shadow-lg backdrop-blur ${liveMode ? "bg-red-500 text-white" : "bg-white/90 text-foreground"}`}>{liveMode ? "Stop live" : "Go live"}</button>
                    </div>
                  </div>
                ) : imageDataUrl ? (
                  <img src={imageDataUrl} alt="Lift interior preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                    <div className="text-3xl">🛗</div>
                    <p>No photo yet. Upload an image, use your camera, or go live.</p>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-border px-4 py-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <NumField id="floor" label="Floor called" value={requestedFloor} onChange={setRequestedFloor} min={1} max={10} />
                  <NumField id="weight" label="Current load (kg)" value={currentWeightKg} onChange={setCurrentWeightKg} min={0} max={5000} />
                  <NumField id="cap" label="Max capacity (kg)" value={maxCapacityKg} onChange={setMaxCapacityKg} min={50} max={5000} />
                  <NumField id="avg" label="Avg person (kg)" value={avgPersonKg} onChange={setAvgPersonKg} min={20} max={200} />
                </div>
                <div>
                  <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                    <span>Weight sensor</span>
                    <span className="tabular-nums">{currentWeightKg} / {maxCapacityKg} kg ({Math.round(Math.min(100, (currentWeightKg / Math.max(1, maxCapacityKg)) * 100))}%)</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className={`h-full transition-all ${(currentWeightKg / maxCapacityKg) > 0.9 ? "bg-destructive" : (currentWeightKg / maxCapacityKg) > 0.7 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (currentWeightKg / Math.max(1, maxCapacityKg)) * 100)}%` }} />
                  </div>
                </div>
                {cameraOn && (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                    <label htmlFor="interval" className="text-xs text-muted-foreground">Live interval</label>
                    <div className="flex items-center gap-2">
                      <input id="interval" type="range" min={2} max={15} step={1} value={intervalSec} onChange={e => setIntervalSec(Number(e.target.value))} className="w-32" />
                      <span className="w-10 text-right text-xs tabular-nums">{intervalSec}s</span>
                    </div>
                  </div>
                )}
                <button onClick={analyze} disabled={loading || !imageDataUrl || liveMode} className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                  {liveMode ? "Live analysis running…" : loading ? "Analyzing…" : "Run AI analysis"}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <ElevatorShaft result={result} floor={requestedFloor} loading={loading} />
          </div>
        </div>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          <HowItWorks step="1" title="See" body="Camera captures a frame of the lift interior when a new floor call comes in." />
          <HowItWorks step="2" title="Estimate" body="AI estimates floor-space occupancy and visible people — not just weight." />
          <HowItWorks step="3" title="Decide" body="Watch the animated lift stop and board a passenger, or skip and turn them away." />
        </section>
      </section>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        Built by Mohith · Concept demo · AI estimates only — not a real elevator controller.
      </footer>
    </main>
  );
}

function NumField({ id, label, value, onChange, min, max }: { id: string; label: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
      <input id={id} type="number" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value) || 0)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm tabular-nums" />
    </div>
  );
}

function HowItWorks({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">{step}</span>
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

async function downscaleToDataUrl(file: File, maxDim: number): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Image load failed"));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale === 1) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}
