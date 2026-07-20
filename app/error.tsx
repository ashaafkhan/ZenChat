'use client';
import { Button } from "@/components/ui/button";
import { AlertCircleIcon } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-32 px-4 text-center">
      <div className="bg-destructive/10 p-4 rounded-full">
        <AlertCircleIcon className="h-8 w-8 text-destructive" />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">Something went wrong!</h2>
      <p className="text-muted-foreground max-w-md">
        An unexpected error occurred. We have been notified and are looking into it.
      </p>
      <p className="text-xs text-muted-foreground max-w-md truncate max-h-10 opacity-50">
        {error.message}
      </p>
      <Button onClick={() => reset()} variant="default" className="mt-4">
        Try again
      </Button>
    </div>
  )
}
