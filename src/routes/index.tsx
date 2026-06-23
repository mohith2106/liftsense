import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LiftSense — AI Lift Occupancy Simulator" },
      {
        name: "description",
        content:
          "Upload or snap a lift interior photo. AI estimates how full it is and decides whether the lift should stop or skip the next floor call.",
      },
      { property: "og:title", content: "LiftSense — AI Lift Occupancy Simulator" },
      {
        property: "og:description",
        content:
          "See how an AI vision system could prevent a packed lift from stopping for new floor calls.",
      },
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
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!liveMode || !cameraOn) return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      if (cancelled || inFlightRef.current) return;
      const url = captureFrameDataUrl();
      if (!url) return;
      lastTickRef.current = Date.now();
      setImageDataUrl(url);
      inFlightRef.current = true;
      try {
        await analyzeWithImage(url);
      } finally {
        inFlightRef.current = false;
      }
    }, Math.max(1, intervalSec) * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMode, cameraOn, intervalSec, currentWeightKg, maxCapacityKg, avgPersonKg]);

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
        body: JSON.stringify({
          imageDataUrl: url,
          currentWeightKg,
          maxCapacityKg,
          avgPersonKg,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? `Analysis failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as AnalysisResult;
      setResult(data);
    } catch {
      toast.error("Network error. Please try again.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setLiveMode(false);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      toast.error("Couldn't access camera. You can upload a photo instead.");
    }
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
    const url = canvas.toDataURL("image/jpeg", 0.85);
    setImageDataUrl(url);
    setResult(null);
    stopCamera();
  }

  async function handleFile(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image is too large. Please use one under 8 MB.");
      return;
    }
    const dataUrl = await downscaleToDataUrl(file, 1024);
    setImageDataUrl(dataUrl);
    setResult(null);
  }

  async function analyze() {
    if (!imageDataUrl) {
      toast.error("Upload or snap a photo first.");
      return;
    }
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
      const data = (await res.json()) as AnalysisResult;
      setResult(data);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-center" />

      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground font-mono text-sm font-bold">
              ▲▼
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">LiftSense</h1>
              <p className="text-xs text-muted-foreground">AI lift occupancy simulator</p>
            </div>
          </div>
          <span className="hidden text-xs uppercase tracking-widest text-muted-foreground sm:inline">
            Concept demo
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Should the lift stop, or skip this floor?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Upload or snap a photo of a lift interior. The AI estimates how much physical
            space is left and decides whether it makes sense to stop for the next floor
            call — even when the weight sensor says there's still room.
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          {/* Left: image input */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-medium">Lift interior</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-accent"
                  >
                    Upload
                  </button>
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-accent sm:hidden"
                  >
                    Camera
                  </button>
                  <button
                    onClick={cameraOn ? stopCamera : startCamera}
                    className="hidden rounded-md border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-accent sm:inline-block"
                  >
                    {cameraOn ? "Stop camera" : "Use webcam"}
                  </button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />

              <div className="aspect-[4/3] w-full bg-muted/40">
                {cameraOn ? (
                  <div className="relative h-full w-full">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="h-full w-full object-cover"
                    />
                    {liveMode && (
                      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                        </span>
                        LIVE · every {intervalSec}s
                      </div>
                    )}
                    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
                      <button
                        onClick={snap}
                        className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-lg"
                      >
                        Capture
                      </button>
                      <button
                        onClick={() => setLiveMode((v) => !v)}
                        className={`rounded-full px-4 py-2 text-sm font-medium shadow-lg backdrop-blur ${
                          liveMode
                            ? "bg-red-500 text-white"
                            : "bg-white/90 text-foreground"
                        }`}
                      >
                        {liveMode ? "Stop live" : "Go live"}
                      </button>
                    </div>
                  </div>
                ) : imageDataUrl ? (
                  <img
                    src={imageDataUrl}
                    alt="Lift interior preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                    <div className="text-3xl">🛗</div>
                    <p>No photo yet. Upload an image, use your camera, or go live.</p>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-border px-4 py-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <NumField
                    id="floor"
                    label="Floor called"
                    value={requestedFloor}
                    onChange={setRequestedFloor}
                    min={-5}
                    max={120}
                  />
                  <NumField
                    id="weight"
                    label="Current load (kg)"
                    value={currentWeightKg}
                    onChange={setCurrentWeightKg}
                    min={0}
                    max={5000}
                  />
                  <NumField
                    id="cap"
                    label="Max capacity (kg)"
                    value={maxCapacityKg}
                    onChange={setMaxCapacityKg}
                    min={50}
                    max={5000}
                  />
                  <NumField
                    id="avg"
                    label="Avg person (kg)"
                    value={avgPersonKg}
                    onChange={setAvgPersonKg}
                    min={20}
                    max={200}
                  />
                </div>

                <WeightBar current={currentWeightKg} max={maxCapacityKg} />

                {cameraOn && (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                    <label htmlFor="interval" className="text-xs text-muted-foreground">
                      Live interval
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="interval"
                        type="range"
                        min={2}
                        max={15}
                        step={1}
                        value={intervalSec}
                        onChange={(e) => setIntervalSec(Number(e.target.value))}
                        className="w-32"
                      />
                      <span className="w-10 text-right text-xs tabular-nums">{intervalSec}s</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={analyze}
                  disabled={loading || !imageDataUrl || liveMode}
                  className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {liveMode ? "Live analysis running…" : loading ? "Analyzing…" : "Run AI analysis"}
                </button>
              </div>
            </div>
          </div>

          {/* Right: result */}
          <div className="lg:col-span-2">
            <ResultPanel result={result} loading={loading} floor={requestedFloor} />
          </div>
        </div>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          <HowItWorks
            step="1"
            title="See"
            body="Camera inside the lift cabin captures a frame when a new floor call comes in."
          />
          <HowItWorks
            step="2"
            title="Estimate"
            body="AI estimates floor-space occupancy and visible people — not just weight."
          />
          <HowItWorks
            step="3"
            title="Decide"
            body="If there's no room, the lift skips the call and saves everyone time."
          />
        </section>
      </section>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        Built by Mohith · Concept demo · AI estimates only — not a real elevator controller.
      </footer>
    </main>
  );
}

function ResultPanel({
  result,
  loading,
  floor,
}: {
  result: AnalysisResult | null;
  loading: boolean;
  floor: number;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <p className="text-sm text-muted-foreground">Scanning lift interior…</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground shadow-sm">
        Run an analysis to see whether the lift would stop at floor{" "}
        <span className="font-medium text-foreground">{floor}</span>.
      </div>
    );
  }

  const stop = result.decision === "STOP";
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div
        className={`px-5 py-4 ${
          stop
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "bg-destructive/10 text-destructive"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest opacity-70">
              Decision · Floor {floor}
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight">
              {stop ? "STOP — room available" : "SKIP — lift is full"}
            </p>
          </div>
          <div className="font-mono text-3xl">{stop ? "▲" : "✕"}</div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Visual occupancy
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {result.occupancyPercent}%
            </span>
          </div>
          <Bar percent={result.occupancyPercent} />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Weight load
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {result.weight.currentKg} / {result.weight.maxKg} kg
            </span>
          </div>
          <Bar percent={result.weight.loadPercent} />
          <p className="mt-1 text-xs text-muted-foreground">
            {result.weight.remainingKg} kg headroom ·{" "}
            {result.weight.weightAllowsOneMore ? "weight allows another person" : "no weight room for another person"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MiniStat label="People detected" value={String(result.peopleCount)} />
          <MiniStat
            label="Room for one more"
            value={result.spaceForOneMore ? "Yes" : "No"}
          />
        </div>

        <div className="space-y-2">
          <div className="rounded-md bg-muted/60 p-3 text-sm leading-relaxed">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              AI vision ·{" "}
            </span>
            {result.reasoning}
          </div>
          <div className="rounded-md border border-border bg-background p-3 text-sm leading-relaxed">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Controller ·{" "}
            </span>
            {result.decisionReason}
          </div>
        </div>
      </div>
    </div>
  );
}

function NumField({
  id,
  label,
  value,
  onChange,
  min,
  max,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm tabular-nums"
      />
    </div>
  );
}

function WeightBar({ current, max }: { current: number; max: number }) {
  const pct = Math.min(100, Math.max(0, (current / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Weight sensor</span>
        <span className="tabular-nums">
          {current} / {max} kg ({Math.round(pct)}%)
        </span>
      </div>
      <Bar percent={pct} />
    </div>
  );
}

function Bar({ percent }: { percent: number }) {
  const p = Math.min(100, Math.max(0, percent));
  const color =
    p > 90 ? "bg-destructive" : p > 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full transition-all ${color}`} style={{ width: `${p}%` }} />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function HowItWorks({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">
          {step}
        </span>
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
