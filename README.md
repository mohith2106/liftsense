# LiftSense

AI lift occupancy simulator, built by Mohith.

Upload or snap a photo of a lift (elevator) interior. The app estimates how much
physical space is left inside the cabin and — combined with a weight sensor
reading — decides whether the lift should **stop** for a new floor call or
**skip** it because there's no real room left, even if the weight sensor alone
would have allowed it.

## Stack

- [TanStack Start](https://tanstack.com/start) (React 19, file-based routing, SSR)
- [TanStack Router](https://tanstack.com/router) + [TanStack Query](https://tanstack.com/query)
- Tailwind CSS v4
- Radix UI primitives
- Vite 7

## Getting started

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

To build for production:

```bash
npm run build
npm run preview
```

## How it works

1. **Capture** — upload a photo, use your webcam, or go "live" to sample frames
   on an interval.
2. **Analyze** — the frame is sent to `POST /api/analyze` along with the
   current weight sensor reading, max cabin capacity, and an average-person
   weight assumption.
3. **Decide** — the server combines a visual space estimate with the weight
   numbers to return a `STOP` or `SKIP` decision, along with the reasoning
   behind it.

## Vision analysis is currently a stub

`src/routes/api/analyze.ts` contains an `analyzeLiftImage()` function that
**does not call any AI model**. It returns a randomized-but-plausible result
so the rest of the app (UI, decision logic, live mode) works end-to-end with
no external dependency and no API key required.

To turn this into a real AI feature, replace the body of `analyzeLiftImage()`
with a call to a vision-capable model API (OpenAI, Anthropic, Google, or a
local model). The function just needs to return an object shaped like:

```ts
{
  occupancyPercent: number;   // 0-100
  peopleCount: number;
  spaceForOneMore: boolean;
  reasoning: string;
}
```

The `imageDataUrl` parameter passed into the function is a base64 `data:` URL
of the captured photo, ready to send to any provider's vision endpoint.

If your provider needs an API key, add it to a `.env` file (see
`.env.example`) and read it with `process.env.YOUR_KEY_NAME` inside the
server route handler.

## Project structure

```
src/
  routes/
    __root.tsx        # App shell, error/404 boundaries
    index.tsx         # Main UI
    api/analyze.ts     # Backend endpoint (vision stub + decision logic)
  components/ui/       # Shared UI components
  lib/                 # Utilities (error reporting, error page, cn helper)
  styles.css           # Tailwind + design tokens
  router.tsx           # Router setup
  start.ts             # Server middleware setup
```

## Disclaimer

This is a concept demo. The decisions are simulated and not connected to any
real elevator controller hardware.
