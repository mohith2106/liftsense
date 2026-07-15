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

  const systemPrompt = `You are a computer vision system inside an elevator (lift). 
Analyze the image and estimate the physical floor-space occupancy of the cabin. 

Return ONLY a compact JSON object with this exact shape:
{
  "occupancyPercent": <integer 0-100, estimated portion of floor space occupied>,
  "peopleCount": <integer, number of people visible>,
  "spaceForOneMore": <boolean, true if a new person could physically step in>,
  "reasoning": "<one short sentence describing what you observed>"
}

Rules:
- Judge space, not weight. Even one large object can fill the floor.
- Be realistic — an empty lift is 0%, a completely packed one is 100%.
- If the image is clearly not the inside of a lift, set spaceForOneMore=false and say so in reasoning.
- Output JSON only. No markdown, no code fences, no extra text.`;

  const response = await fetch(
    \`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=\${apiKey}\`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
              { text: "Analyze this lift interior. Respond with the JSON object only." },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429) {
      throw new Error("Gemini rate limit reached. Please wait a moment and try again.");
    }
    if (response.status === 400) {
      throw new Error("Invalid request to Gemini API. The image may be too large or in an unsupported format.");
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

  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/m, "").trim();

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
