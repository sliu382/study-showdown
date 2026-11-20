# StudyShowdown

## Project overview

StudyShowdown turns a study topic into a Jeopardy-style quiz board. It gives students a way to practice active recall without writing a full set of questions first. Solo players can review missed answers and replay saved boards. Study groups can take turns on one device and steal unanswered clues.

[Play StudyShowdown on DeepSpace](https://study-showdown.app.space)

## Features

- Generate a board with 3–6 categories and three questions per category. Choose a topic and learning level, and optionally supply category names and study context.
- Play Solo Study with answer reveal, self-assessment, scoring, and missed-question review.
- Play local multiplayer with 2–4 players, typed answers, individual scores, and round-robin steals after an incorrect answer or pass.
- Try the sample board as a guest. Sign in with DeepSpace to generate boards, save solo attempts, and replay boards from private study history.

## Technology stack

- **Frontend.** React 19, TypeScript, Vite, React Router with Generouted, and Tailwind CSS. Pages live in [`src/pages`](src/pages) and share components and gameplay logic in [`src/game`](src/game).
- **Backend.** A Hono app running on Cloudflare Workers via DeepSpace. [`worker.ts`](worker.ts) registers the quiz and study routes, and Zod validates request data and generated boards.
- **DeepSpace.** Auth handles sessions and JWTs. The quiz endpoint uses the authenticated caller’s JWT with the DeepSpace AI proxy and the Vercel AI SDK to request structured output. RecordRoom stores boards and attempts in SQLite-backed Durable Objects.

## Engineering decisions

- **Deterministic grading.** Multiplayer compares normalized text against the stored answer and accepted variants. Grading is local, consistent, and incurs no per-answer AI calls.
- **Board reuse.** Saved boards can be replayed in either available mode without a new generation request. Boards and solo attempts are separate records, so multiple attempts can share one board. Local multiplayer scores stay out of personal study history.
- **Shared-device multiplayer.** The game keeps turns, steals, and scores in browser state, which avoids the need for rooms or network synchronization.
- **Billing and ownership.** Quiz requests use the caller’s credentials. Study reads are scoped to record owners on the server, and the generic browser integration execution route is disabled.

## Local development

Use Node.js 22.15 or later in the 22.x line, Node.js 24.x, or Node.js 26.x, and npm 11.6 or later. A DeepSpace developer account with access to the configured app is needed for the local DeepSpace runtime.

From the cloned repository:

```sh
npm ci
npm run login
npm run dev
```

Open the local URL printed by the CLI. [`wrangler.toml`](wrangler.toml) contains the app identity and Worker bindings. The CLI prepares the ignored `.dev.vars` file for local development. Keep credentials in DeepSpace’s managed configuration and out of Git. The sample board works without an in-app sign-in or an AI request.

## Testing and verification

| Command | Purpose |
| --- | --- |
| `npm run type-check` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run test:unit` | Vitest unit and route tests |
| `npm run validate` | TypeScript and Vitest together |
| `npm test` | DeepSpace smoke and API suites |
| `npm run test:smoke` / `npm run test:api` | Run either browser suite separately |
| `npm run test:e2e` | Full Playwright suite |
| `npm run build` | Production build and landing-page prerender |

The latest release verification passed TypeScript, ESLint, the production build, **133 Vitest tests**, and **19 Playwright tests**. A separate check passed **24 assertions** against the built Worker and a real local SQLite RecordRoom.

Automated generation tests mock the AI provider. Saved-game browser scenarios mock study API responses, while the synthetic-account checks use real DeepSpace Auth. Hosted smoke checks confirmed sign-in, guest access denials, and rejection of the retired integration route. Actual AI credit debits and hosted isolation against a populated study history remain unverified.

## Known limitations

- Typed grading can reject valid equivalents missing from the stored variants. Some older boards with ungradable answers support solo play only.
- Multiplayer is limited to one device.
- AI-generated clues can contain factual errors. Generation throttling is best-effort per Worker isolate.

## AI-assisted development

Codex assisted with implementation, debugging, documentation, and verification.
