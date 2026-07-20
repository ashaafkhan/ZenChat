import { Button } from "@/components/ui/button";
import { GhostIcon } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-32 px-4 text-center">
      <div className="bg-muted p-4 rounded-full">
        <GhostIcon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">Page Not Found</h2>
      <p className="text-muted-foreground max-w-md">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link href="/">
        <Button variant="default" className="mt-4">
          Return Home
        </Button>
      </Link>
    </div>
  )
}
