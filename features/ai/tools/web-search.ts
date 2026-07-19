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
