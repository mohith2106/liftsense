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

async function analyzeLiftImage(imageDataUrl: string): Promise<SpaceAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
  }

  const matches = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid image data URL format.");
  }
  const mimeType = matches[1];
  const base64Data = matches[2];

  const prompt = \`You are an elevator occupancy detection system. Your job is to analyze a photo taken inside an elevator cabin and estimate how full it is.

STEP 1 — Count people: Look carefully at the image. Count every person you can see, including partial views (someone's shoulder, legs, etc.). If you see no people at all, count is 0.

STEP 2 — Estimate floor space used: Imagine the floor of the elevator as a grid. What percentage of that floor area is covered by people's feet and bodies?
- 0 people = 0%
- 1 person in a standard elevator = roughly 15-25%
- 2 people = roughly 30-45%
- 3 people = roughly 45-60%
- 4-5 people = roughly 65-80%
- 6+ people or very crowded = 80-100%

STEP 3 — Decide if one more person can fit: Could one additional adult step into the elevator without it being dangerously overcrowded? Be generous — if there's any reasonable floor space left, say true.

STEP 4 — If the image is NOT an elevator interior (e.g. a street, room, office, outdoor scene), set occupancyPercent to 0, peopleCount to 0, spaceForOneMore to false, and explain in reasoning.

Respond with ONLY this JSON, no other text:
{
  "occupancyPercent": <number 0-100>,
  "peopleCount": <number>,
  "spaceForOneMore": <true or false>,
  "reasoning": "<one sentence: what you see and why you gave this occupancy estimate>"
}\`;

  const response = await fetch(
    \`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=\${apiKey}\`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 300,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      throw new Error("Gemini rate limit reached. Please wait a moment and try again.");
    }
    throw new Error(\`Gemini API error (\${response.status}): \${errorText.slice(0, 200)}\`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  if (!raw) {
    throw new Error("Gemini returned an empty response.");
  }

  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\$/m, "").trim();

  let space: SpaceAnalysis;
  try {
    space = JSON.parse(cleaned) as SpaceAnalysis;
  } catch {
    throw new Error(\`Gemini returned unparseable JSON: \${cleaned.slice(0, 200)}\`);
  }

  space.occupancyPercent = Math.min(100, Math.max(0, Math.round(Number(space.occupancyPercent) || 0)));
  space.peopleCount = Math.max(0, Math.round(Number(space.peopleCount) || 0));
  space.spaceForOneMore = Boolean(space.spaceForOneMore);
  space.reasoning = String(space.reasoning || "No reasoning provided.");

  return space;
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
          const message = error instanceof Error ? error.message : "Vision analysis failed.";
          console.error("Vision analysis failed:", error);
          return Response.json({ error: message }, { status: 502 });
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
          decisionReason = \`No physical room (≈\${space.occupancyPercent}% full) AND only \${remainingKg} kg left under capacity.\`;
        } else if (!space.spaceForOneMore) {
          decision = "SKIP";
          decisionReason = \`Weight is fine (\${remainingKg} kg spare) but the cabin is visually packed — no room to step in.\`;
        } else if (!weightAllowsOneMore) {
          decision = "SKIP";
          decisionReason = \`Looks like there's floor space, but weight is at \${loadPercent}% — only \${remainingKg} kg left, under the \${avgPersonKg} kg-per-person budget.\`;
        } else {
          decision = "STOP";
          decisionReason = \`Space available (≈\${100 - space.occupancyPercent}% free) and \${remainingKg} kg of weight headroom — safe to stop.\`;
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
