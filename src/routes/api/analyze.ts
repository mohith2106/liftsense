import { createFileRoute } from "@tanstack/react-router";

type Body = {
  imageDataUrl?: string;
  currentWeightKg?: number;
  maxCapacityKg?: number;
  avgPersonKg?: number;
  maxPeople?: number;
};

type SpaceAnalysis = {
  occupancyPercent: number;
  peopleCount: number;
  spaceForOneMore: boolean;
  reasoning: string;
};

type FinalResult = SpaceAnalysis & {
  decision: "STOP" | "SKIP";
  maxPeople: number;
  roomForMore: number;
  weight: {
    currentKg: number;
    maxKg: number;
    remainingKg: number;
    loadPercent: number;
    weightAllowsOneMore: boolean;
  };
  decisionReason: string;
};

async function analyzeLiftImage(
  imageDataUrl: string,
  maxPeople: number
): Promise<SpaceAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not set.");

  const matches = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid image data URL format.");
  const mimeType = matches[1];
  const base64Data = matches[2];

  const prompt = \`You are an elevator occupancy counter. Count every person visible in this elevator photo.

Rules:
- Count each person once, even if partially visible (a shoulder, legs, or back counts as a person).
- If the image is clearly NOT an elevator interior, set peopleCount to -1.
- An empty elevator = 0 people.

This elevator allows a maximum of \${maxPeople} people.

Respond with ONLY this JSON object, no other text:
{
  "peopleCount": <integer, number of people you can see>,
  "reasoning": "<one sentence: describe what you see>"
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
              { inline_data: { mime_type: mimeType, data: base64Data } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 150,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429)
      throw new Error("Gemini rate limit reached. Please wait a moment and try again.");
    throw new Error(\`Gemini API error (\${response.status}): \${errorText.slice(0, 200)}\`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  if (!raw) throw new Error("Gemini returned an empty response.");
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\$/m, "").trim();

  let parsed: { peopleCount: number; reasoning: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(\`Gemini returned unparseable JSON: \${cleaned.slice(0, 200)}\`);
  }

  const isNotElevator = Number(parsed.peopleCount) === -1;
  const peopleCount = isNotElevator ? 0 : Math.max(0, Math.round(Number(parsed.peopleCount) || 0));
  const occupancyPercent = isNotElevator ? 0 : Math.min(100, Math.round((peopleCount / Math.max(1, maxPeople)) * 100));
  const spaceForOneMore = !isNotElevator && peopleCount < maxPeople;

  return {
    occupancyPercent,
    peopleCount,
    spaceForOneMore,
    reasoning: String(parsed.reasoning || "No reasoning provided."),
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
          maxPeople = 10,
        } = body;

        if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
          return new Response("imageDataUrl required (data:image/...)", { status: 400 });
        }

        let space: SpaceAnalysis;
        try {
          space = await analyzeLiftImage(imageDataUrl, maxPeople);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Vision analysis failed.";
          console.error("Vision analysis failed:", error);
          return Response.json({ error: message }, { status: 502 });
        }

        const remainingKg = Math.max(0, maxCapacityKg - currentWeightKg);
        const loadPercent = Math.round(
          Math.min(100, Math.max(0, (currentWeightKg / Math.max(1, maxCapacityKg)) * 100))
        );
        const weightAllowsOneMore = remainingKg >= avgPersonKg;
        const roomForMore = Math.max(0, maxPeople - space.peopleCount);
        const peopleAtMax = space.peopleCount >= maxPeople;

        let decision: "STOP" | "SKIP";
        let decisionReason: string;

        if (peopleAtMax && !weightAllowsOneMore) {
          decision = "SKIP";
          decisionReason = \`At capacity: \${space.peopleCount}/\${maxPeople} people AND weight at \${loadPercent}% — no room.\`;
        } else if (peopleAtMax) {
          decision = "SKIP";
          decisionReason = \`At capacity: \${space.peopleCount}/\${maxPeople} people detected — lift is full by headcount.\`;
        } else if (!weightAllowsOneMore) {
          decision = "SKIP";
          decisionReason = \`Only \${space.peopleCount}/\${maxPeople} people but weight is at \${loadPercent}% — only \${remainingKg} kg left.\`;
        } else {
          decision = "STOP";
          decisionReason = \`\${space.peopleCount}/\${maxPeople} people — room for \${roomForMore} more. Weight headroom: \${remainingKg} kg.\`;
        }

        const result: FinalResult = {
          ...space,
          decision,
          decisionReason,
          maxPeople,
          roomForMore,
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
