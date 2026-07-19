import * as React from "react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { SearchIcon, CheckCircleIcon, AlertCircleIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ToolProps = {
  part: any;
};

export function Tool({ part }: ToolProps) {
  const isStreaming = part.state === "input-streaming" || part.state === "input-available";
  
  const [isOpen, setIsOpen] = React.useState(isStreaming);

  React.useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [isStreaming]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full mb-2">
      <ToolHeader part={part} isOpen={isOpen} />
      <ToolContent part={part} />
    </Collapsible>
  );
}

export function ToolHeader({ part, isOpen }: { part: any; isOpen: boolean }) {
  const isStreaming = part.state === "input-streaming" || part.state === "input-available";
  const isError = !!part.output?.error || !!part.errorText;
  const query = part.input?.query || "something";

  return (
    <CollapsibleTrigger className="flex items-center w-full max-w-sm justify-between rounded-lg border bg-card p-3 text-sm font-medium hover:bg-accent/50 text-left transition-colors">
      <div className="flex items-center gap-2 truncate">
        {isStreaming ? (
          <SearchIcon className="h-4 w-4 animate-pulse text-muted-foreground shrink-0" />
        ) : isError ? (
          <AlertCircleIcon className="h-4 w-4 text-destructive shrink-0" />
        ) : (
          <CheckCircleIcon className="h-4 w-4 text-green-500 shrink-0" />
        )}
        <span className="truncate">Searched the web for &ldquo;{query}&rdquo;</span>
      </div>
      {isOpen ? <ChevronUpIcon className="h-4 w-4 text-muted-foreground shrink-0 ml-2" /> : <ChevronDownIcon className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />}
    </CollapsibleTrigger>
  );
}

export function ToolContent({ part }: { part: any }) {
  const isError = !!part.output?.error || !!part.errorText;
  const errorMsg = part.output?.error || part.errorText;
  const results = part.output?.results || [];
  
  const isStreaming = part.state === "input-streaming" || part.state === "input-available";

  if (isStreaming && !isError && results.length === 0) {
    return null; // Do not render content while searching if no results/error
  }

  return (
    <CollapsibleContent className="mt-2 space-y-2">
      {isError ? (
        <Alert variant="destructive" className="max-w-sm">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {results.map((result: any, i: number) => {
            let hostname = "";
            try {
              hostname = new URL(result.url).hostname;
            } catch (e) {
              hostname = result.url;
            }
            return (
              <a
                key={i}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md border p-3 hover:bg-accent/50 transition-colors bg-card"
              >
                <div className="text-sm font-semibold truncate">{result.title}</div>
                <div className="text-xs text-muted-foreground truncate">{hostname}</div>
                <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{result.snippet}</div>
              </a>
            );
          })}
        </div>
      )}
    </CollapsibleContent>
  );
}
