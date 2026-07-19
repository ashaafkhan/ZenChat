# ZenChat — Web Search Tool Calling & Chat Branching

**Product Requirements Document (PRD) — Build Plan**
Version 1.0 · Prepared for stage-by-stage implementation with an AI pair programmer

---

## 0. How to use this document

This PRD is written to be worked through **one stage at a time**. Each stage is scoped to a single sitting, touches a known, bounded set of files, and ends with acceptance criteria you can literally check off before moving on. Don't skip ahead — Stage 6 depends on Stage 5's schema, Stage 8 depends on Stage 7's actions, etc.

For every stage there's a **"Prompt block"** — copy it (plus the relevant file contents) straight into Claude Code / Cursor / whatever you're pairing with. It already encodes the existing code style so the output won't look bolted on.

House style to preserve everywhere (observed in the existing repo, keep matching it):
- Server actions live in `features/<domain>/actions/*.ts`, start with `"use server"`, call `requireUser()` first, then an `assertOwnsConversation`-style ownership check.
- Client data access goes through TanStack Query hooks in `features/<domain>/hooks/use-*.ts`, using `queryKeys` from `features/conversation/utils/query-keys.ts`, with `sonner` toasts on error.
- UI primitives come from `components/ui/*` (shadcn-style, already installed — don't reinstall shadcn components that already exist, check the folder first).
- Chat-specific composable UI lives in `components/ai-elements/*`, mirroring the [Vercel AI Elements](https://ai-sdk.dev/elements) pattern already used for `Message`, `Conversation`, `Loader`.
- Prisma models are small and index-conscious; every new query pattern gets a matching `@@index`.

---

## 1. Goals & Non-Goals

### Goals
1. The assistant can **decide for itself** when to search the web, execute the search, and weave the results into its streamed answer — the person should feel like it "just knew" to look something up.
2. Every tool call and its result is **persisted** and re-renders identically on page reload.
3. From **any message** in a conversation, a user can spin off an **independent branch** that shares everything up to that point and diverges afterward.
4. Branches can be **navigated, renamed, and deleted** through a clean UI, and are fully persisted.
5. Code quality matches the existing codebase's conventions well enough that a reviewer can't tell where the original project ends and the new work begins.

### Non-goals (explicitly out of scope, call these out if asked to expand scope)
- Multi-user / shared-conversation collaboration.
- Merging two branches back together.
- A visual tree/graph view of branches (a flat switcher + breadcrumb is enough for this assignment).
- Supporting tool calls other than web search (structure is extensible, but we ship one tool).
- Streaming partial tool-input JSON token-by-token in the UI (we show the tool card once the call starts, not a live-typing JSON view).

---

## 2. Current State Audit

What's already in the repo today, so we know exactly what we're extending:

| Concern | File(s) | Notes |
|---|---|---|
| Chat streaming endpoint | `app/api/chat/route.ts` | `streamText` + `toUIMessageStream`, single-step, no tools yet |
| Model selection | `features/ai/utils/model.ts` | Hardcoded to Groq, default `llama-3.1-8b-instant` |
| Message persistence | `features/ai/actions/chat-store.ts` | Upserts `UIMessage[]` by id, stores `parts` as JSON — **this already stores whatever `parts` array the SDK gives us**, which matters a lot for tool calls (see §4) |
| Conversation CRUD | `features/conversation/actions/conversation-actions.ts`, `features/conversation/hooks/use-conversation.ts` | Ownership-checked server actions + React Query hooks, this is the pattern to copy for Branches |
| Message CRUD (non-streaming) | `features/messages/actions/messages-action.ts`, `features/messages/hooks/use-messages.ts` | Separate from `chat-store.ts` (that one's used by the streaming route only) |
| Conversation UI shell | `features/conversation/components/{chatshell,conversation-view,chat-messages,chat-composer,chat-empty}.tsx` | `conversation-view.tsx` owns `useChat()` |
| Sidebar | `features/conversation/components/app-sidebar.tsx` | Lists conversations, has rename/pin/delete already — **copy this UX for branches** |
| Reusable chat UI kit | `components/ai-elements/{conversation,message,loader}.tsx` | `message.tsx` **already ships a full `MessageBranch*` component set** (prev/next/selector) — built for regenerate-style branching, not our tree-branching, but its visual language (ButtonGroup + "1 of 3" page indicator) is what our branch switcher should feel like |
| DB schema | `prisma/schema.prisma` | `User → Conversation → Message`, `Message.parts` is already `Json?` |
| Auth | `features/auth/action/{require-user,onboard}.ts`, `proxy.ts` | Clerk, unaffected by this work |

**Two things worth flagging before we start:**

1. **`DEFAULT_CHAT_MODEL = "llama-3.1-8b-instant"` is on Groq's deprecation list**, alongside `llama-3.3-70b-versatile`. Groq's recommended replacements are `openai/gpt-oss-120b` (or the smaller `openai/gpt-oss-20b`), which also have solid tool-calling support. We'll swap this in Stage 1 regardless of branching/search — it'll break soon otherwise.
2. **`zod` is not in `package.json`** yet, even though the `ai` SDK's `tool()` helper wants a Zod schema for `inputSchema`. We add it in Stage 1.

---

## 3. Key Technical Decisions

### 3.1 Web search provider: **Tavily**
- Free tier: **1,000 search credits/month, no credit card**. A basic search = 1 credit, so that's ~1,000 real searches/month for local dev + grading — plenty.
- Purpose-built for LLM tool use (clean JSON output: title/url/content/score, optional AI-generated answer snippet), which means less prompt-engineering to make results digestible for a small model like `gpt-oss-20b`.
- Plain `fetch` against `https://api.tavily.com/search` — no SDK dependency required, keeps the diff small.
- **Alternatives considered:** Groq itself exposes built-in server-side tools (including a hosted web search) on some models via `compound_custom.tools`. We are **not** using that — it hides the tool-calling loop entirely on Groq's side, which defeats the point of the assignment (the rubric wants *you* to implement invocation, streaming, and persistence). Serper.dev and Brave Search API are fine drop-in alternatives if Tavily ever misbehaves in grading — the tool wrapper in Stage 1 is written so swapping providers only touches one file.

### 3.2 Model: switch to `openai/gpt-oss-120b` on Groq
Tool-calling capable, not on the deprecation list, still fast/free-tier friendly. `getChatModel()` keeps its existing signature (per-conversation override via `conversation.model` still works).

### 3.3 Branching data model: a `Branch` table, not duplicate `Conversation` rows
Two designs were considered:

- **(A) "Fork the conversation"** — duplicate messages up to the fork point into a brand-new `Conversation` row. Simple queries, but duplicates data, complicates "which chats belong together" in the sidebar, and makes rename/delete ambiguous (is it deleting a chat or a branch?).
- **(B) "Branch as a first-class node in a tree, scoped to one conversation"** — a new `Branch` model where each `Message` belongs to exactly one branch, and a branch optionally points at a parent branch + the exact message it forked from. Rendering a branch's timeline = the parent chain's messages up to the fork point, plus this branch's own messages after.

**We're going with (B).** It matches the rubric's language ("preserve its own history while still sharing the original conversation until the branching point") literally, keeps one `Conversation` = one sidebar entry = one title, and it's the same mental model ChatGPT/Claude use internally for "edit and branch." It also means `useChat({ id })` can key its streaming state **by `branchId`**, which gives us free per-branch isolation in the AI SDK's client cache — no extra state management needed.

Full schema in §4.

### 3.4 Tool-call persistence: no schema change needed
`Message.parts` is already `Json?` and `chat-store.ts` already stores whatever `UIMessage.parts` contains on `onEnd`. In AI SDK v5+, a tool call/result becomes a part in that same array (shape `{ type: "tool-web_search", state, input, output, toolCallId }` for statically-typed tools). **We don't need a migration for Phase 1** — we need the route to pass `tools` to `streamText`, and the UI to know how to render that part type. That's it. This is worth confirming for yourself once you're in Stage 2/3 (log `message.parts` and eyeball the shape), because exact key names can shift between SDK patch versions.

---

## 4. Environment Variables

Add to `.env` (create `.env.example` too — see Stage 10):

```bash
# existing
DATABASE_URL=postgres://...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
GROQ_API_KEY=...

# new — Phase 1
TAVILY_API_KEY=tvly-...
```

No new env vars are needed for Phase 2 (branching) — it's pure Postgres + app logic.

---

## 5. Data Model — Full Prisma Diff

```prisma
model Conversation {
  id             String @id @default(cuid())
  userId         String
  title          String @default("New Chat")
  model          String?
  systemPrompt   String? @db.Text
  isPinned       Boolean @default(false)
  isArchived     Boolean @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  lastMessageAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  messages Message[]
  branches Branch[]   // NEW

  @@index([userId, lastMessageAt(sort: Desc)])
  @@index([userId, isPinned, lastMessageAt(sort: Desc)])
}

// NEW MODEL
model Branch {
  id                   String   @id @default(cuid())
  conversationId       String
  name                 String   @default("Main")
  parentBranchId       String?
  branchPointMessageId String?  // id of the LAST shared message, living in the parent branch
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  parent       Branch?      @relation("BranchTree", fields: [parentBranchId], references: [id], onDelete: SetNull)
  children     Branch[]     @relation("BranchTree")
  messages     Message[]

  @@index([conversationId])
  @@index([parentBranchId])
}

enum MessageRole { USER ASSISTANT SYSTEM TOOL }
enum MessageStatus { PENDING COMPLETE ERROR }

model Message {
  id                String @id @default(cuid())
  conversationId    String
  branchId          String   // NEW — every message belongs to exactly one branch
  role              MessageRole
  status            MessageStatus @default(COMPLETE)
  content           String @db.Text
  parts             Json?
  metadata          Json?

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  branch       Branch       @relation(fields: [branchId], references: [id], onDelete: Cascade) // NEW

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([conversationId, createdAt(sort: Desc)])
  @@index([branchId, createdAt(sort: Desc)]) // NEW
}
```

**Why keep `conversationId` on `Message` even though `branchId` implies it?** It's a deliberate denormalization: cheap "all messages in this conversation, across every branch" queries (useful for search/export later) without a join, and it makes the cascade-delete story easy to reason about. Don't remove it.

**Root branch rule:** a branch with `parentBranchId = null` is the conversation's root/"Main" branch. Every `Conversation` must have exactly one. We enforce this at the application layer (create both in the same transaction — see Stage 5), not with a DB constraint, since Postgres partial unique indexes are more ceremony than this needs.

---

## 6. Stage-by-Stage Build Plan

### Stage 1 — Environment & Model Prep
**Why first:** everything else breaks if the model can't call tools, and you don't want a deprecated-model surprise mid-grading.

**Files touched:**
- `package.json` (add `zod`)
- `features/ai/utils/model.ts`
- `.env` / `.env.example`

**Tasks:**
1. `npm install zod` (or `bun add zod` — repo has a `bun.lock`, prefer bun for consistency).
2. Update `DEFAULT_CHAT_MODEL` to `"openai/gpt-oss-120b"` in `model.ts`. Keep the function signature identical (`getChatModel(modelId?)`) so nothing downstream changes.
3. Sign up for a free Tavily key at tavily.com, add `TAVILY_API_KEY` to `.env`.
4. Sanity check: existing chat still streams a plain answer with the new model before touching anything else.

**Acceptance criteria:**
- [ ] `npm run dev` boots with no missing-module errors.
- [ ] A message sent in the existing UI still streams back a normal answer.
- [ ] `TAVILY_API_KEY` present locally (test with a raw `curl` against `https://api.tavily.com/search` before wiring it into the app — see Stage 2 curl snippet).

> **Prompt block:** "In `features/ai/utils/model.ts`, change `DEFAULT_CHAT_MODEL` from `llama-3.1-8b-instant` to `openai/gpt-oss-120b` (Groq deprecated the old one). Keep everything else in the file identical. Then add `zod` as a dependency."

---

### Stage 2 — Web Search Tool: Provider Client + Tool Definition
**Goal:** a standalone, testable tool the model *can* call — not wired into the route yet.

**Files created:**
- `features/ai/tools/web-search.ts` — the AI SDK `tool()` definition
- `features/ai/tools/tavily-client.ts` — thin fetch wrapper around Tavily's REST API

**Tasks:**
1. In `tavily-client.ts`, export an async `searchWeb(query: string, opts?: { maxResults?: number })` that:
   - POSTs to `https://api.tavily.com/search` with `{ api_key, query, max_results, search_depth: "basic", include_answer: false }`.
   - Has a **timeout** (`AbortSignal.timeout(8000)` is fine here — Next.js 16 / recent Node support it natively).
   - Throws a typed error (`class TavilySearchError extends Error`) on non-2xx or network failure — don't swallow it here, Stage 4 handles graceful degradation at the call site.
   - Returns a small normalized shape, not Tavily's raw payload:
     ```ts
     type WebSearchResult = { title: string; url: string; snippet: string };
     ```
2. In `web-search.ts`:
   ```ts
   import { tool } from "ai";
   import { z } from "zod";
   import { searchWeb, TavilySearchError } from "./tavily-client";

   export const webSearchTool = tool({
     description:
       "Search the public web for current information — news, prices, " +
       "releases, or anything that may have changed after your training " +
       "data. Do not use this for stable facts you already know.",
     inputSchema: z.object({
       query: z.string().min(1).describe("A concise search query, 3-8 words"),
     }),
     execute: async ({ query }) => {
       try {
         const results = await searchWeb(query, { maxResults: 5 });
         return { query, results };
       } catch (error) {
         // Returned (not thrown) so the model can see the failure and
         // tell the user, instead of the whole stream erroring out.
         return {
           query,
           results: [],
           error:
             error instanceof TavilySearchError
               ? error.message
               : "Web search is temporarily unavailable.",
         };
       }
     },
   });
   ```
3. Write the description carefully — this is 100% of how the model decides *whether* to search. Too eager and it searches for "what's 2+2"; too shy and it never fires. Iterate on wording once you're testing end-to-end in Stage 3.

**Acceptance criteria:**
- [ ] A scratch script (or a temporary API route) calling `searchWeb("today's date")` returns real results.
- [ ] Killing your network / using a bad API key returns the graceful `{ error }` shape, doesn't throw uncaught.

> **Prompt block:** "Create `features/ai/tools/tavily-client.ts` with a `searchWeb(query, opts)` function hitting Tavily's `/search` REST endpoint, 8s timeout, typed error class. Then create `features/ai/tools/web-search.ts` exporting a Vercel AI SDK `tool()` called `webSearchTool` with a Zod `inputSchema` of `{ query: string }`, whose `execute` calls `searchWeb` and never throws — on failure it returns `{ query, results: [], error }`."

---

### Stage 3 — Wire the Tool into `streamText` (Multi-Step Loop)
**Goal:** the model can now actually call it mid-conversation.

**Files touched:**
- `app/api/chat/route.ts`

**Tasks:**
1. Import `webSearchTool` and pass it: `tools: { web_search: webSearchTool }`.
2. Add `stopWhen: stepCountIs(4)` (import `stepCountIs` from `"ai"`). Without this the SDK defaults to a single step and the model can never see its own tool's output before answering. 4 steps = plenty for "search → read results → answer," with headroom for a rare second search.
3. Extend the system prompt with one or two lines about the tool's existence and boundaries, e.g. *"You have access to a `web_search` tool for anything time-sensitive or beyond your knowledge. Prefer it over guessing at current events, prices, scores, or releases. Don't narrate that you're about to search — just do it."* Keep the existing guardrail paragraphs untouched underneath.
4. Everything else in the route (`convertToModelMessages`, `toUIMessageStream`, `onEnd` → `saveChatMessages`) stays as-is — tool call/result parts ride along in `finalMessages` automatically.

**Acceptance criteria:**
- [ ] Ask something clearly post-cutoff / time-sensitive (e.g. "who won the last F1 race") and confirm — via a temporary `console.log` inside `execute` — that the tool actually fires.
- [ ] Ask something timeless ("what's the capital of France") and confirm it does **not** fire.
- [ ] The final answer references the search results in prose (not just dumping raw JSON).

> **Prompt block:** "In `app/api/chat/route.ts`, add `tools: { web_search: webSearchTool }` and `stopWhen: stepCountIs(4)` to the `streamText` call (import `webSearchTool` from `@/features/ai/tools/web-search`, `stepCountIs` from `ai`). Append two sentences to the existing system prompt describing when to use the tool, without changing the guardrail rules already there."

---

### Stage 4 — Render Tool Calls in the Chat UI
**Goal:** the person watching the stream sees "🔍 Searched the web for…" collapse into results, not a JSON blob or nothing at all.

**Files created:**
- `components/ai-elements/tool.tsx` — new reusable primitive, same conventions as `message.tsx`/`conversation.tsx` (exported building blocks, `cn()` for classes, typed props via `ComponentProps<...>`)

**Files touched:**
- `features/conversation/components/chat-messages.tsx`

**Tasks:**
1. Build `Tool`, `ToolHeader`, `ToolContent` in `tool.tsx` on top of the **existing** `components/ui/collapsible.tsx` (don't build a new disclosure widget from scratch — reuse what shadcn already gave this project). Rough shape:
   - `ToolHeader`: icon (`SearchIcon` while loading/streaming, swap to `CheckIcon`/`AlertCircleIcon` on success/error) + `"Searched the web for “{query}”"` + chevron.
   - `ToolContent`: renders a short list of result cards (title, hostname, snippet), or an inline error message styled with your existing `Alert`/`alert.tsx` component if `part.output.error` is set.
   - Collapsed by default once the result lands; auto-expanded while `state === "input-streaming" | "input-available"` so the loading state is visible.
2. In `chat-messages.tsx`, iterate `message.parts` (not just filter to text like today) and render each part by `part.type`:
   ```tsx
   {message.parts.map((part, i) => {
     if (part.type === "text") return <MessageResponse key={i}>{part.text}</MessageResponse>;
     if (part.type === "tool-web_search") return <Tool key={i} part={part} />;
     return null;
   })}
   ```
   Keep this **inside** the existing `<Message>`/`<MessageContent>` wrapper so a message can show "searching → result card → final text" all stacked in order, matching how ChatGPT/Claude render it.
3. Confirm the exact literal for `part.type` by logging one real streamed message in dev — tool part type names are `` `tool-${toolName}` `` in current AI SDK versions, but verify against your installed version rather than trusting this doc blindly (see the note in §3.4).

**Acceptance criteria:**
- [ ] While the tool runs, a "Searching the web…" card is visible (not the generic three-dot `Loader` standing in for it).
- [ ] Once results land, the card is collapsible and shows real titles/links.
- [ ] Refreshing the page re-renders the exact same card from persisted `parts` — no "it looked right during streaming but broke on reload" bug.

> **Prompt block:** "Create `components/ai-elements/tool.tsx` exporting `Tool`, `ToolHeader`, `ToolContent`, built on `components/ui/collapsible.tsx`, following the same export style as `components/ai-elements/message.tsx`. It should visually distinguish loading / success / error states for a web-search tool part. Then update `features/conversation/components/chat-messages.tsx` to map over `message.parts` and render `tool-web_search` parts with `<Tool>` alongside existing text parts, preserving order."

---

### Stage 5 — Error Handling & Loading-State Pass (close out Phase 1)
**Goal:** nothing about tool calling should be able to take down the whole chat.

**Files touched:**
- `features/ai/tools/web-search.ts` (double-check, from Stage 2 — the `execute` should already never throw)
- `app/api/chat/route.ts`
- `features/conversation/components/conversation-view.tsx`

**Tasks:**
1. Confirm `TAVILY_API_KEY` missing entirely (not just invalid) is handled: `tavily-client.ts` should check `process.env.TAVILY_API_KEY` up front and return/throw the same `TavilySearchError` shape rather than sending a request with `api_key: undefined`.
2. In `conversation-view.tsx`, the existing `onError` toast already covers route-level failures — verify a *tool* failure doesn't trigger this path at all (it shouldn't, since `execute` catches internally and the stream continues normally with an error-shaped tool result, which is exactly the point).
3. Add a rate-limit-aware branch in `tavily-client.ts`: on HTTP 429, return a distinct message ("Search rate limit reached, try again in a moment") instead of the generic failure string, so the model (and therefore the user) gets an accurate excuse.
4. Manually test all four states: happy path, missing key, bad key (401), simulated timeout (temporarily point the URL at a non-routable host).

**Acceptance criteria:**
- [ ] All four failure modes above degrade to a spoken sentence from the assistant ("I wasn't able to search the web just now, but here's what I know…") — never a broken UI, never an uncaught exception in server logs that kills the response.
- [ ] Happy-path tool calls are unaffected by any of this defensive code.

> **Prompt block:** "Harden `features/ai/tools/tavily-client.ts`: check for a missing `TAVILY_API_KEY` before making a request, and give HTTP 429 responses a distinct, user-readable error message from other failures. Don't change the function signatures."

---

**✅ Phase 1 (Web Search Tool Calling) is now complete.** Before moving to branching, re-read the rubric's Tool Calling row (Integration / Invocation / Streaming / Error Handling / DB Persistence) and check each box against what you just built.

---

### Stage 6 — Branching: Schema Migration + History-Resolution Logic
**Goal:** the data layer that everything else in Phase 2 stands on.

**Files touched:**
- `prisma/schema.prisma` (apply the diff from §5)
- New migration under `prisma/migrations/<timestamp>_add_branches/migration.sql`

**Files created:**
- `features/branches/actions/branch-actions.ts`

**Tasks:**
1. Edit `schema.prisma` with the `Branch` model + `Message.branchId` from §5.
2. Run `npx prisma migrate dev --name add_branches`. Prisma will want `branchId` to have a value for existing rows — since this is a fresh assignment DB, the simplest path is: **wipe local dev data and re-migrate clean** (`prisma migrate reset`). If you need to preserve existing rows, add a data-backfill step to the generated SQL: create one `Branch` row per existing `Conversation` (`name = 'Main'`, `parentBranchId = NULL`), then `UPDATE "Message" SET "branchId" = <that branch's id>` per conversation, before the `NOT NULL` constraint is applied. Either approach is fine — document which one you took in the migration's SQL comments.
3. Update **`createConversation`** (`conversation-actions.ts`) and **`startNewChat`** (`features/home/actions/start-new-chat.ts`) to create the conversation **and its root branch** together in a `prisma.$transaction`:
   ```ts
   const [conversation, branch] = await prisma.$transaction(async (tx) => {
     const conversation = await tx.conversation.create({ data: { userId: user.id, title } });
     const branch = await tx.branch.create({
       data: { conversationId: conversation.id, name: "Main" },
     });
     return [conversation, branch];
   });
   ```
   Both call sites now need to return/redirect with `branch.id` available too — `startNewChat` should redirect to `/c/${conversation.id}?branch=${branch.id}` (Stage 8 makes this param meaningful).
4. In `branch-actions.ts`, implement the core primitives (mirror the ownership-check pattern from `conversation-actions.ts`):
   - `getRootBranch(conversationId)` → `prisma.branch.findFirstOrThrow({ where: { conversationId, parentBranchId: null } })`
   - `listBranches(conversationId)` → all branches for a conversation, ordered `createdAt asc`, after an ownership check
   - `getBranchMessages(branchId)` — **the important one**. Recursive resolution:
     ```ts
     async function getBranchMessages(branchId: string): Promise<Message[]> {
       const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });

       let inherited: Message[] = [];
       if (branch.parentBranchId && branch.branchPointMessageId) {
         const parentMessages = await getBranchMessages(branch.parentBranchId);
         const cutoff = parentMessages.findIndex(
           (m) => m.id === branch.branchPointMessageId
         );
         inherited = cutoff >= 0 ? parentMessages.slice(0, cutoff + 1) : parentMessages;
       }

       const own = await prisma.message.findMany({
         where: { branchId },
         orderBy: { createdAt: "asc" },
       });

       return [...inherited, ...own];
     }
     ```
   - `createBranch(conversationId, fromMessageId, name?)` — fetches the source message to find its **current** `branchId` (that becomes `parentBranchId`), auto-generates a name from the first ~6 words of the source message's content if none given, creates the `Branch` row.
   - `renameBranch(branchId, name)`, `deleteBranch(branchId)` — `deleteBranch` must throw a clear error if `parentBranchId === null` (never delete the root/Main branch) **or** if the branch still has children (ask the user to delete child branches first — don't silently cascade a whole subtree away).

**Acceptance criteria:**
- [ ] `npx prisma migrate dev` runs clean, `npx prisma studio` shows a `Branch` row per conversation.
- [ ] A hand-written test script: create branch B off message M in root branch R, add 2 messages to B, call `getBranchMessages(B.id)` → returns [all R messages up to and including M] + [B's 2 new messages], in order.
- [ ] `deleteBranch(rootBranchId)` throws; `deleteBranch(branchWithChildren)` throws.

> **Prompt block:** "Add a `Branch` model to `prisma/schema.prisma` per this spec: [paste §5 diff]. Generate a migration named `add_branches`. Then create `features/branches/actions/branch-actions.ts` with `getRootBranch`, `listBranches`, `getBranchMessages` (recursive parent-chain resolution up to `branchPointMessageId`, then this branch's own messages), `createBranch`, `renameBranch`, and `deleteBranch` (refuse to delete the root branch or a branch with children). Follow the ownership-check pattern in `features/conversation/actions/conversation-actions.ts`."

---

### Stage 7 — Rewire Message Loading/Saving to be Branch-Aware
**Goal:** every existing code path that reads/writes messages by `conversationId` now reads/writes by `branchId`, without breaking auth or title logic.

**Files touched:**
- `features/ai/actions/chat-store.ts` (`loadChatMessages`, `saveChatMessages`)
- `app/api/chat/route.ts`
- `features/messages/actions/messages-action.ts`
- `app/(root)/c/[id]/page.tsx`

**Tasks:**
1. `loadChatMessages(branchId)` — swap its query to use `getBranchMessages(branchId)` from Stage 6 instead of `prisma.message.findMany({ where: { conversationId } })`.
2. `saveChatMessages(branchId, messages, options)` now needs `conversationId` too (for the title/`lastMessageAt` update at the end) — pass it in from the route, or look it up once via `branch.conversationId` inside the function. New messages get created with `{ conversationId, branchId, ... }`.
3. **Title-rename guard:** the "if title is still 'New Chat', set it from the first user message" logic should only ever fire when writing to the **root branch**. A branch's own first message should never rename the conversation. Add `if (branch.parentBranchId === null) { …title update… }` around that block.
4. `app/api/chat/route.ts`: request body becomes `{ branchId, message }` instead of `{ id, message }`. Look up the branch, verify `branch.conversation.userId === user.id` (join through `include: { conversation: true }` in the Prisma call, replacing the current direct `conversation.findFirst`).
5. `app/(root)/c/[id]/page.tsx` needs to read a `branch` search param:
   ```ts
   type ConversationPageProps = {
     params: Promise<{ id: string }>;
     searchParams: Promise<{ branch?: string }>;
   };
   ```
   Resolve to `getRootBranch(id)` when `branch` is absent/invalid (defends against stale/bad links), otherwise use the given id after confirming it belongs to this conversation.

**Acceptance criteria:**
- [ ] Sending a message on the root branch behaves exactly as before this stage (regression check).
- [ ] `loadChatMessages` on a child branch returns the correct spliced history from Stage 6's test.
- [ ] Sending the first message on a freshly created *branch* does **not** change the conversation's sidebar title.

> **Prompt block:** "Update `features/ai/actions/chat-store.ts` so `loadChatMessages` takes a `branchId` and calls `getBranchMessages` from `features/branches/actions/branch-actions.ts`. Update `saveChatMessages` to write `branchId` on new messages and only run the 'rename from first message' logic when the branch is the root branch (`parentBranchId === null`). Then update `app/api/chat/route.ts` to accept `{ branchId, message }`, verifying ownership via the branch's conversation. Finally update `app/(root)/c/[id]/page.tsx` to read a `?branch=` search param, defaulting to the conversation's root branch."

---

### Stage 8 — Branch Creation UX ("Branch from this message")
**Goal:** the actual "create a branch" affordance on a message.

**Files touched:**
- `features/conversation/components/chat-messages.tsx`
- `features/conversation/components/conversation-view.tsx`

**Files created:**
- `features/branches/hooks/use-branches.ts` (React Query hooks — mirror `use-conversation.ts`)
- `features/branches/components/branch-from-message-button.tsx`

**Tasks:**
1. Add `queryKeys.branches = { byConversation: (conversationId) => ["branches", conversationId] as const }` to `features/conversation/utils/query-keys.ts`.
2. `use-branches.ts`: `useBranches(conversationId)`, `useCreateBranch(conversationId)`, `useRenameBranch(conversationId)`, `useDeleteBranch(conversationId)` — same shape as `useConversations`/`useUpdateConversation`/`useDeleteConversation`, `sonner` toasts on error, invalidate `queryKeys.branches.byConversation` (and `queryKeys.messages.byConversation` for the new branch once created).
3. `branch-from-message-button.tsx`: a small icon button (`GitBranchIcon` from `lucide-react`) using the existing `MessageAction`/`MessageActions` components from `components/ai-elements/message.tsx` (they already exist and already handle the tooltip + ghost-icon styling — don't reinvent this). On click, open a `components/ui/dialog.tsx` with a single text input pre-filled with an auto-generated name ("Branch from "explain more about..."), Cancel/Create buttons.
4. On successful creation, `router.push(`/c/${conversationId}?branch=${newBranch.id}`)`.
5. Wire the button into `chat-messages.tsx` — show it on hover per message (`group-hover` pattern, consistent with how `SidebarMenuAction`'s `showOnHover` behaves in `app-sidebar.tsx`), for both user and assistant messages.

**Acceptance criteria:**
- [ ] Hovering any message reveals a branch icon; clicking it opens a named dialog, not a bare `window.prompt` (upgrade over the sidebar's rename UX, don't copy its shortcut here).
- [ ] Creating a branch mid-conversation immediately navigates to a chat that shows identical history up to that message, empty after it.
- [ ] Sending a new message in the new branch does **not** appear if you navigate back to `?branch=<root>`.

> **Prompt block:** "Create `features/branches/hooks/use-branches.ts` with TanStack Query hooks for list/create/rename/delete branches, following the exact pattern in `features/conversation/hooks/use-conversation.ts`. Then create `features/branches/components/branch-from-message-button.tsx`: a hover-revealed icon button (reuse `MessageAction` from `components/ai-elements/message.tsx`) that opens a `Dialog` (from `components/ui/dialog.tsx`) to name and create a branch from a given message id, then navigates to `/c/[conversationId]?branch=[newBranchId]`. Wire it into `chat-messages.tsx` per-message."

---

### Stage 9 — Branch Navigation UI (Switcher + Lineage Breadcrumb)
**Goal:** move between branches without hunting through URLs.

**Files touched:**
- `features/conversation/components/conversation-view.tsx`

**Files created:**
- `features/branches/components/branch-switcher.tsx`

**Tasks:**
1. `branch-switcher.tsx`: replace the current bare `<h1>{title}</h1>` in `conversation-view.tsx`'s header with a `DropdownMenu` (from `components/ui/dropdown-menu.tsx`, same component family already used in `app-sidebar.tsx`) showing:
   - The conversation title as a non-interactive label at top.
   - Every branch, indented by depth in the parent chain (compute depth client-side from the flat list `useBranches` already returns — no extra query needed), with the active one checked/highlighted.
   - A trailing "+ New branch from here" item that branches from the **last message in the current view** (reuses the Stage 8 creation hook, just defaults `fromMessageId` to `messages.at(-1)!.id`).
2. Above or beside the switcher, render a lineage breadcrumb using the existing `components/ui/breadcrumb.tsx` (e.g. `Main / Branch: "explain more" / Branch: "try again"`) — walk `parentBranchId` up to root client-side from the already-fetched branch list, no new query.
3. `useChat`'s `id` in `conversation-view.tsx` becomes the **active branchId**, not the conversation id — this is what gives each branch its own isolated AI SDK client-side chat cache for free. `transport`'s `prepareSendMessagesRequest` body becomes `{ branchId, message }`.
4. Switching branches via the dropdown does a `router.push` with the new `?branch=` param; because `key={id}` is already used at the page level (`ConversationView key={id}` in `app/(root)/c/[id]/page.tsx`), also key on the resolved branch id so `useChat` fully resets between branches instead of merging state.

**Acceptance criteria:**
- [ ] Switching branches updates the URL, shows a loading state briefly, then the correct message history — no stale flash of the previous branch's messages.
- [ ] The active branch is visibly indicated in the dropdown.
- [ ] Breadcrumb correctly shows 2+ levels deep when you branch from a branch.

> **Prompt block:** "Create `features/branches/components/branch-switcher.tsx`: a `DropdownMenu` (see `components/ui/dropdown-menu.tsx`, used already in `features/conversation/components/app-sidebar.tsx`) listing all branches for a conversation from `useBranches`, indented by depth, active one highlighted, with a trailing 'New branch from here' action. Pair it with a `Breadcrumb` (from `components/ui/breadcrumb.tsx`) showing the lineage path to the current branch. Update `features/conversation/components/conversation-view.tsx` to key `useChat` by the active `branchId` (not `conversationId`), replacing the header's plain `<h1>` with these two new pieces."

---

### Stage 10 — Branch Management (Rename/Delete) + Final Polish
**Goal:** close out Phase 2's rubric row and sand down rough edges.

**Files touched:**
- `features/branches/components/branch-switcher.tsx`

**Tasks:**
1. Each branch row (except the root branch) gets a small overflow menu (reuse the `DropdownMenu` inside a `DropdownMenu` trigger pattern already used for `ChatItem` in `app-sidebar.tsx`, or a nested `Popover`) with **Rename** and **Delete**.
2. Rename: inline text input or a small `Dialog`, calling `useRenameBranch`.
3. Delete: **must** use `components/ui/alert-dialog.tsx` for a destructive confirmation (this component already exists in the project, unused so far — use it here, it's the correct primitive over a bare `confirm()`). On confirm, call `useDeleteBranch`; if the branch has children, surface the server's rejection message via `sonner` toast rather than letting the request silently fail.
4. If the currently active branch gets deleted, redirect to the conversation's root branch.
5. Polish pass:
   - Loading skeleton for the branch switcher while `useBranches` is fetching (match the `Skeleton` usage already in `app-sidebar.tsx`'s `ChatList`).
   - Confirm mobile width behavior — the switcher + breadcrumb + `SidebarTrigger` all need to fit in the existing `h-14` header without wrapping; collapse the breadcrumb to just the current branch name below a breakpoint if needed.
   - Confirm keyboard/aria basics: dropdown items are reachable via keyboard, delete confirmation traps focus (the `alert-dialog.tsx` primitive should already handle this — verify, don't assume).
6. Re-read the whole feature end-to-end as a new user would: new chat → send messages → branch mid-way → send more → branch again from the branch → rename it → switch back and forth → delete a leaf branch → refresh the page and confirm everything survives.

**Acceptance criteria:**
- [ ] Rename updates immediately in the switcher and breadcrumb.
- [ ] Deleting the root branch is impossible from the UI (button disabled/absent, not just erroring).
- [ ] Deleting a branch with children shows a clear error toast, doesn't crash.
- [ ] Full walkthrough in task 6 survives a hard page refresh at every step.

> **Prompt block:** "Add rename/delete actions to each non-root row in `features/branches/components/branch-switcher.tsx`. Delete must go through `components/ui/alert-dialog.tsx` for confirmation. Disable/hide delete for the root branch. On successful delete of the active branch, redirect to the conversation's root branch. Add a loading skeleton state matching `ChatList`'s pattern in `app-sidebar.tsx`."

---

## 7. Cross-Cutting QA Matrix (mirrors the grading rubric)

Use this as your literal pre-submission checklist.

**Tool Calling (30 pts)**
- [ ] Tool Integration — Tavily wired behind a typed `tool()` definition, swappable provider
- [ ] Tool Invocation — model decides on its own, verified with both a time-sensitive and a timeless prompt
- [ ] Streaming — tool call/result appears inline mid-stream, not after the fact
- [ ] Error Handling — missing key / 401 / 429 / timeout all degrade gracefully (Stage 5)
- [ ] Database Persistence — reload the page, tool card renders identically from stored `parts`

**Chat Branching (35 pts)**
- [ ] Branch Creation — from any message, via the hover button (Stage 8)
- [ ] Branch Navigation — dropdown switcher + breadcrumb (Stage 9)
- [ ] Branch Management — rename + delete with guardrails (Stage 10)
- [ ] Data Persistence — `Branch` + `Message.branchId` schema, survives refresh
- [ ] Overall UX — no stale flashes, no dead ends (deleted active branch, root branch protected)

**Code Quality (20 pts)**
- [ ] Project structure — new code lives under `features/branches/*` and `features/ai/tools/*`, matching existing `features/<domain>` convention
- [ ] Reusable components — `Tool`, `BranchSwitcher` built from existing `components/ui/*` primitives, not reinvented
- [ ] Type safety — no `any`, `UIMessage`/`Message`/`Branch` types flow end-to-end
- [ ] Clean architecture — server actions vs. hooks vs. components stay in their existing lanes
- [ ] Documentation — JSDoc comments on non-obvious functions (`getBranchMessages` especially), matching the light commenting style already in the repo

**User Experience (10 pts)**
- [ ] Loading states — tool-searching indicator, branch-switch skeleton
- [ ] Responsive — header doesn't wrap/overflow on mobile widths
- [ ] Error handling — toasts everywhere a mutation can fail, never a silent no-op
- [ ] Overall polish — animations/transitions feel consistent with the rest of the app (check existing `tw-animate-css` usage for cues)

**Deployment (5 pts)** — see §8 below.

---

## 8. Deployment Guide

1. **Postgres:** the project already uses `@prisma/adapter-pg`, so any standard Postgres works — Neon or Supabase's free tiers are the path of least resistance (`npx create-db` is even referenced in the existing schema comment).
2. **Vercel project settings → Environment Variables:** `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `GROQ_API_KEY`, `TAVILY_API_KEY`.
3. **Build command:** ensure migrations run on deploy — set the Vercel build command to `npx prisma migrate deploy && next build` (or add it to a `postinstall`/`vercel-build` script in `package.json`).
4. **Clerk:** add your Vercel production domain to Clerk's allowed origins/redirect URLs before the first deploy.
5. Push, confirm the live URL, then paste it into your submission along with:

## 9. README Update (Stage 10 deliverable)

Replace the current boilerplate `README.md` with:
- One-paragraph project description (what ZenChat is + the two features you added).
- Setup steps (`bun install`, `.env` from `.env.example`, `npx prisma migrate deploy`, `bun dev`).
- Table of environment variables (copy §4/§8's list) with where to obtain each key.
- Short "Architecture" section: link to this PRD or summarize §3's decisions in a few sentences.
- Live URL.

Also add a `.env.example` (same keys as §4, empty/placeholder values) — right now the repo has **no env file at all**, which is worth fixing regardless of these two features.

---

## 10. Appendix — Ideas Explicitly Deferred

If you finish early or want extra polish for the "Overall UX" rubric line, in priority order:
1. Sidebar tree view of branches (nested under each conversation via `SidebarMenuSub`, which already exists in `components/ui/sidebar.tsx` — unused so far) instead of only the header switcher.
2. A second tool (e.g. a calculator or a "fetch this URL" tool) to show the architecture generalizes past one tool.
3. Optimistic UI for branch creation (navigate instantly, show a pending state, reconcile on success) instead of waiting for the mutation before navigating.
4. Streaming the tool's *input* JSON token-by-token in the UI, not just showing the card once the call starts.
