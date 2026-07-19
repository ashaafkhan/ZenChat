export class TavilySearchError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TavilySearchError";
    }
}

type WebSearchResult = {
    title: string;
    url: string;
    snippet: string;
};

export async function searchWeb(
    query: string,
    opts?: { maxResults?: number }
): Promise<WebSearchResult[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        throw new TavilySearchError("TAVILY_API_KEY is not set in environment variables");
    }

    try {
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                api_key: apiKey,
                query: query,
                max_results: opts?.maxResults ?? 5,
                search_depth: "basic",
                include_answer: false,
            }),
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
            throw new TavilySearchError(`Tavily API returned status: ${response.status}`);
        }

        const data = await response.json();
        
        return (data.results || []).map((result: any) => ({
            title: result.title,
            url: result.url,
            snippet: result.content,
        }));
    } catch (error) {
        if (error instanceof TavilySearchError) {
            throw error;
        }
        if (error instanceof Error && error.name === "AbortError") {
            throw new TavilySearchError("Tavily search request timed out");
        }
        throw new TavilySearchError(`Network or fetch error: ${error instanceof Error ? error.message : String(error)}`);
    }
}
