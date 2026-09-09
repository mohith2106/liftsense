import { createFileRoute } from "@tanstack/react-router";

type Body = {
  imageDataUrl?: string;
  currentWeightKg?: number;
  maxCapacityKg?: number;
  avgPersonKg?: number;
};

type SpaceAnalysis = {
  occupancyPercent: number;
  peopleCount: number;
  spaceForOneMore: boolean;
  reasoning: string;
};

type FinalResult = SpaceAnalysis & {
  decision: "STOP" | "SKIP";
  weight: {
    currentKg: number;
    maxKg: number;
    remainingKg: number;
    loadPercent: number;
    weightAllowsOneMore: boolean;
  };
  decisionReason: string;
};

/**
 * Vision analysis — STUB.
 *
 * This replaces a call to a third-party hosted AI gateway that only
 * worked inside its original platform and required a vendor-specific
 * API key.
 *
 * Right now this returns a randomized-but-plausible result so the rest of
 * the app (UI, decision logic, live mode) works end-to-end with no
 * external dependency.
 *
 * To make this a real AI feature, replace the body of this function with
 * a call to whichever vision-capable model API you want to use (OpenAI,
 * Anthropic, Google, or a local model). The function just needs to return
 * a SpaceAnalysis object built from the model's response. The imageDataUrl
 * parameter is a base64 data: URL of the lift interior photo, ready to be
 * sent to any provider's vision endpoint.
 */
async function analyzeLiftImage(imageDataUrl: string): Promise<SpaceAnalysis> {
  // Touch the param so it's clear this is where the image would be sent.
  void imageDataUrl;

  const occupancyPercent = Math.floor(Math.random() * 101);
  const peopleCount = Math.max(0, Math.round(occupancyPercent / 18));
  const spaceForOneMore = occupancyPercent < 80;

  return {
    occupancyPercent,
    peopleCount,
    spaceForOneMore,
    reasoning: spaceForOneMore
      ? "Stub analysis: estimated open floor space based on a placeholder value. Replace analyzeLiftImage() with a real vision API call."
      : "Stub analysis: cabin estimated near capacity (placeholder value). Replace analyzeLiftImage() with a real vision API call.",
  };
}

export const Route = createFileRoute("/api/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Body;
        const {
          imageDataUrl,
          currentWeightKg = 0,
          maxCapacityKg = 630,
          avgPersonKg = 70,
        } = body;

        if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
          return new Response("imageDataUrl required (data:image/...)", { status: 400 });
        }

        let space: SpaceAnalysis;
        try {
          space = await analyzeLiftImage(imageDataUrl);
        } catch (error) {
          console.error("Vision analysis failed:", error);
          return Response.json(
            { error: "Vision analysis failed. See server logs for details." },
            { status: 502 },
          );
        }

        const remainingKg = Math.max(0, maxCapacityKg - currentWeightKg);
        const loadPercent = Math.round(
          Math.min(100, Math.max(0, (currentWeightKg / Math.max(1, maxCapacityKg)) * 100)),
        );
        const weightAllowsOneMore = remainingKg >= avgPersonKg;

        let decision: "STOP" | "SKIP";
        let decisionReason: string;

        if (!space.spaceForOneMore && !weightAllowsOneMore) {
          decision = "SKIP";
          decisionReason = `No physical room (≈${space.occupancyPercent}% full) AND only ${remainingKg} kg left under capacity.`;
        } else if (!space.spaceForOneMore) {
          decision = "SKIP";
          decisionReason = `Weight is fine (${remainingKg} kg spare) but the cabin is visually packed — no room to step in.`;
        } else if (!weightAllowsOneMore) {
          decision = "SKIP";
          decisionReason = `Looks like there's floor space, but weight is at ${loadPercent}% — only ${remainingKg} kg left, under the ${avgPersonKg} kg-per-person budget.`;
        } else {
          decision = "STOP";
          decisionReason = `Space available (≈${100 - space.occupancyPercent}% free) and ${remainingKg} kg of weight headroom — safe to stop.`;
        }

        const result: FinalResult = {
          ...space,
          decision,
          decisionReason,
          weight: {
            currentKg: currentWeightKg,
            maxKg: maxCapacityKg,
            remainingKg,
            loadPercent,
            weightAllowsOneMore,
          },
        };

        return Response.json(result);
      },
    },
  },
});
