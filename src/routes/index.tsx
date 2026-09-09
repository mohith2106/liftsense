import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LiftSense — AI Lift Occupancy Simulator" },
      { name: "description", content: "Upload or snap a lift interior photo. AI decides whether the lift should stop or skip the next floor call." },
      { property: "og:title", content: "LiftSense — AI Lift Occupancy Simulator" },
      { property: "og:description", content: "See how an AI vision system could prevent a packed lift from stopping for new floor calls." },
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

const FLOORS = 10;

function floorY(f: number, shaftH: number) {
  const TOP_PAD = 20, BOT_PAD = 20;
  const usable = shaftH - TOP_PAD - BOT_PAD;
  const floorH = usable / FLOORS;
  return TOP_PAD + (FLOORS - f) * floorH;
}

function cabY(f: number, shaftH: number) {
  const CAB_H = 36;
  const TOP_PAD = 20, BOT_PAD = 20;
  const usable = shaftH - TOP_PAD - BOT_PAD;
  const floorH = usable / FLOORS;
  return floorY(f, shaftH) + (floorH - CAB_H) / 2;
}

type ElevatorProps = {
  result: AnalysisResult | null;
  floor: number;
  loading: boolean;
};

function ElevatorShaft({ result, floor, loading }: ElevatorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number | null>(null);
  const SHAFT_H = 440;
  const CAB_H = 36;

  useEffect(() => {
    if (!result) return;
    const svg = svgRef.current;
    if (!svg) return;

    const cabBox = svg.querySelector<SVGRectElement>("#cabBox");
    const doorL = svg.querySelector<SVGLineElement>("#doorL");
    const doorR = svg.querySelector<SVGLineElement>("#doorR");
    const cabLbl = svg.querySelector<SVGTextElement>("#cabLbl");
    const calledRect = svg.querySelector<SVGRectElement>("#calledRect");
    const calledTxt = svg.querySelector<SVGTextElement>("#calledTxt");
    if (!cabBox || !doorL || !doorR || !cabLbl || !calledRect || !calledTxt) return;

    if (animRef.current) cancelAnimationFrame(animRef.current);

    const calF = Math.max(1, Math.min(FLOORS, floor));
    const fromF = 1;
    const fromY = cabY(fromF, SHAFT_H);
    const toY = cabY(calF, SHAFT_H);
    const calFloorY = floorY(calF, SHAFT_H);
    const TOP_PAD = 20, BOT_PAD = 20;
    const floorH = (SHAFT_H - TOP_PAD - BOT_PAD) / FLOORS;

    calledRect.setAttribute("y", String(calFloorY));
    calledRect.setAttribute("height", String(floorH));
    calledRect.setAttribute("opacity", "1");
    calledTxt.setAttribute("y", String(calFloorY + floorH / 2 + 4));
    calledTxt.setAttribute("opacity", "1");

    cabBox.setAttribute("fill", "var(--surface-2)");
    cabBox.setAttribute("stroke", "var(--border-strong)");
    doorL.setAttribute("x1", "75"); doorL.setAttribute("x2", "75");
    doorR.setAttribute("x1", "85"); doorR.setAttribute("x2", "85");

    function setPos(y: number) {
      cabBox.setAttribute("y", String(y));
      cabLbl.setAttribute("y", String(y + CAB_H / 2 + 4));
      doorL.setAttribute("y1", String(y + 2)); doorL.setAttribute("y2", String(y + CAB_H - 2));
      doorR.setAttribute("y1", String(y + 2)); doorR.setAttribute("y2", String(y + CAB_H - 2));
    }

    setPos(fromY);

    const dur = Math.abs(calF - fromF) * 220 + 400;
    let start: number | null = null;

    function animate(ts: number) {
      if (!start) start = ts;
      const t = Math.min((ts - start) / dur, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setPos(fromY + (toY - fromY) * ease);
      if (t < 1) { animRef.current = requestAnimationFrame(animate); return; }
      setPos(toY);

      if (result.decision === "STOP") {
        cabBox.setAttribute("stroke", "var(--border-success)");
        cabBox.setAttribute("fill", "var(--bg-success)");
        setTimeout(() => {
          doorL.setAttribute("x1", "57"); doorL.setAttribute("x2", "57");
          doorR.setAttribute("x1", "103"); doorR.setAttribute("x2", "103");
        }, 150);
        setTimeout(() => {
          doorL.setAttribute("x1", "75"); doorL.setAttribute("x2", "75");
          doorR.setAttribute("x1", "85"); doorR.setAttribute("x2", "85");
          cabBox.setAttribute("fill", "var(--surface-2)");
          cabBox.setAttribute("stroke", "var(--border-strong)");
        }, 2600);
      } else {
        cabBox.setAttribute("stroke", "var(--border-danger)");
        cabBox.setAttribute("fill", "var(--bg-danger)");
        setTimeout(() => {
          const skipF = calF < FLOORS ? calF + 1 : calF - 1;
          const skipY = cabY(skipF, SHAFT_H);
          const skipDur = 500;
          let s2: number | null = null;
          function skip(ts2: number) {
            if (!s2) s2 = ts2;
            const t2 = Math.min((ts2 - s2) / skipDur, 1);
            setPos(toY + (skipY - toY) * t2);
            if (t2 < 1) { animRef.current = requestAnimationFrame(skip); return; }
            setPos(skipY);
            cabBox.setAttribute("fill", "var(--surface-2)");
            cabBox.setAttribute("stroke", "var(--border-strong)");
          }
          animRef.current = requestAnimationFrame(skip);
        }, 500);
      }
    }

    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [result, floor]);

  const floorTickData = Array.from({ length: FLOORS }, (_, i) => i + 1);
  const TOP_PAD = 20, BOT_PAD = 20;
  const floorH = (SHAFT_H - TOP_PAD - BOT_PAD) / FLOORS;

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
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <p className="text-sm text-muted-foreground">Scanning lift interior…</p>
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="px-5 py-4 text-sm text-muted-foreground">
          Run an analysis to see whether the lift would stop at floor <span className="font-medium text-foreground">{floor}</span>.
        </div>
      )}

      <div className="flex justify-center py-4 px-2">
        <svg ref={svgRef} viewBox={`0 0 160 ${SHAFT_H}`} width="160" height={SHAFT_H} xmlns="http://www.w3.org/2000/svg">
          <rect x="20" y="0" width="120" height={SHAFT_H} rx="4" fill="var(--surface-1)" stroke="var(--border)" strokeWidth="0.5" />
          <line x1="20" y1="0" x2="20" y2={SHAFT_H} stroke="var(--border-strong)" strokeWidth="1" />
          <line x1="140" y1="0" x2="140" y2={SHAFT_H} stroke="var(--border-strong)" strokeWidth="1" />
          <line x1="78" y1="0" x2="78" y2={SHAFT_H} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2,6" />
          <line x1="82" y1="0" x2="82" y2={SHAFT_H} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2,6" />

          {floorTickData.map(f => {
            const y = floorY(f, SHAFT_H);
            return (
              <g key={f}>
                <line x1="20" x2="140" y1={y} y2={y} stroke="var(--border)" strokeWidth="0.5" />
                <text x="10" y={y + floorH / 2 + 4} textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-sans, system-ui)">{f}</text>
              </g>
            );
          })}

          <rect id="calledRect" x="22" y="0" width="116" height={floorH} opacity="0" fill="var(--bg-warning)" />
          <text id="calledTxt" x="80" y="0" textAnchor="middle" fontSize="10" fill="var(--text-warning)" fontFamily="var(--font-sans, system-ui)" opacity="0">floor called</text>

          <g id="cab">
            <rect id="cabBox" x="30" y={cabY(1, SHAFT_H)} width="100" height={CAB_H} rx="4" fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="1" />
            <line id="doorL" x1="75" x2="75" y1={cabY(1, SHAFT_H) + 2} y2={cabY(1, SHAFT_H) + CAB_H - 2} stroke="var(--border-stronger)" strokeWidth="1.5" style={{ transition: "x1 0.4s ease, x2 0.4s ease" }} />
            <line id="doorR" x1="85" x2="85" y1={cabY(1, SHAFT_H) + 2} y2={cabY(1, SHAFT_H) + CAB_H - 2} stroke="var(--border-stronger)" strokeWidth="1.5" style={{ transition: "x1 0.4s ease, x2 0.4s ease" }} />
            <text id="cabLbl" x="80" y={cabY(1, SHAFT_H) + CAB_H / 2 + 4} textAnchor="middle" fontSize="11" fill="var(--text-secondary)" fontFamily="var(--font-sans, system-ui)">▲▼</text>
          </g>
        </svg>
      </div>

      {result && (
        <div className="space-y-3 border-t border-border px-5 pb-5">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Visual occupancy</span>
              <span className="text-sm font-semibold tabular-nums">{result.occupancyPercent}%</span>
            </div>
            <Bar percent={result.occupancyPercent} />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Weight</span>
              <span className="text-sm font-semibold tabular-nums">{result.weight.currentKg}/{result.weight.maxKg} kg</span>
            </div>
            <Bar percent={result.weight.loadPercent} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="People" value={String(result.peopleCount)} />
            <MiniStat label="Room for one more" value={result.spaceForOneMore ? "Yes" : "No"} />
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

function Bar({ percent }: { percent: number }) {
  const p = Math.min(100, Math.max(0, percent));
  const color = p > 90 ? "bg-destructive" : p > 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full transition-all ${color}`} style={{ width: `${p}%` }} />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
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
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? `Analysis failed (${res.status})`);
        return;
      }
      setResult((await res.json()) as AnalysisResult);
    } catch { toast.error("Network error. Please try again."); }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setLiveMode(false);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      setTimeout(() => {
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      }, 50);
    } catch { toast.error("Couldn't access camera. You can upload a photo instead."); }
  }

  function snap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setImageDataUrl(canvas.toDataURL("image/jpeg", 0.85));
    setResult(null);
    stopCamera();
  }

  async function handleFile(file: File) {
    if (file.size > 8 * 1024 * 1024) { toast.error("Image is too large. Please use one under 8 MB."); return; }
    setImageDataUrl(await downscaleToDataUrl(file, 1024));
    setResult(null);
  }

  async function analyze() {
    if (!imageDataUrl) { toast.error("Upload or snap a photo first."); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, currentWeightKg, maxCapacityKg, avgPersonKg }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? `Analysis failed (${res.status})`);
        return;
      }
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
          <p className="mt-3 text-muted-foreground">
            Upload or snap a photo of a lift interior. The AI estimates how much physical space is left and decides whether it makes sense to stop for the next floor call.
          </p>
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

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }} />

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
                      <button onClick={() => setLiveMode((v) => !v)} className={`rounded-full px-4 py-2 text-sm font-medium shadow-lg backdrop-blur ${liveMode ? "bg-red-500 text-white" : "bg-white/90 text-foreground"}`}>{liveMode ? "Stop live" : "Go live"}</button>
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

                <WeightBar current={currentWeightKg} max={maxCapacityKg} />

                {cameraOn && (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                    <label htmlFor="interval" className="text-xs text-muted-foreground">Live interval</label>
                    <div className="flex items-center gap-2">
                      <input id="interval" type="range" min={2} max={15} step={1} value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))} className="w-32" />
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
          <HowItWorks step="1" title="See" body="Camera inside the lift cabin captures a frame when a new floor call comes in." />
          <HowItWorks step="2" title="Estimate" body="AI estimates floor-space occupancy and visible people — not just weight." />
          <HowItWorks step="3" title="Decide" body="If there's no room, the lift skips the call and saves everyone time." />
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
      <input id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm tabular-nums" />
    </div>
  );
}

function WeightBar({ current, max }: { current: number; max: number }) {
  const pct = Math.min(100, Math.max(0, (current / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Weight sensor</span>
        <span className="tabular-nums">{current} / {max} kg ({Math.round(pct)}%)</span>
      </div>
      <Bar percent={pct} />
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
