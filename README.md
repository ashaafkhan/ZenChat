# ZenChat

ZenChat is an advanced chat application powered by Next.js, Clerk for authentication, Prisma + Postgres for data persistence, and the AI SDK. It features **seamless tool calling** (integrating Tavily for live web search functionality directly in the chat) and an innovative **conversation branching system**, allowing users to diverge their chats from any historical message and easily navigate between alternative timelines using a nested branch switcher.

## Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Configure environment:**
   Copy the example environment file and fill in your keys:
   ```bash
   cp .env.example .env
   ```

3. **Database initialization:**
   Run the Prisma migrations to set up your PostgreSQL database (Neon or Supabase work great):
   ```bash
   npx prisma migrate deploy
   ```

4. **Start development server:**
   ```bash
   bun dev
   ```

## Environment Variables

| Variable | Description | Where to obtain |
|----------|-------------|-----------------|
| `DATABASE_URL` | PostgreSQL connection string | Neon, Supabase, etc. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Auth frontend key | Clerk Dashboard |
| `CLERK_SECRET_KEY` | Clerk Auth backend key | Clerk Dashboard |
| `GROQ_API_KEY` | Groq LLM API Key | [Groq Console](https://console.groq.com/keys) |
| `TAVILY_API_KEY` | Tavily Web Search API Key | [Tavily Dashboard](https://app.tavily.com/home) |

## Architecture

ZenChat employs a clean separation of concerns using Next.js App Router server actions and TanStack Query on the client. 
- **Tool Calling:** We extend the AI SDK `streamText` response with a typed `webSearchTool` that utilizes the Tavily API. The client securely parses the multi-part tool results and maps them into rich React components (`<Tool />`), gracefully falling back with 429/401 handlers.
- **Branching:** The Prisma schema represents branches as a tree `(Branch -> parentBranchId, branchPointMessageId)`. Each `Message` is tagged with its `branchId`. The UI uses `useChat` keyed by `branchId`, completely isolating state per branch. Switching branches dynamically calculates lineage without extra queries.

## Live Deployment

[Live Demo URL]
