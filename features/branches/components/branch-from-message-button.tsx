"use client";

import { MessageAction, MessageActions } from "@/components/ai-elements/message";
import { GitBranchIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useCreateBranch } from "../hooks/use-branches";
import { UIMessage, isTextUIPart } from "ai";

export const BranchFromMessageButton = ({ conversationId, message }: { conversationId: string; message: UIMessage }) => {
    const [open, setOpen] = useState(false);
    
    // Auto-generate name based on message
    const textContent = message.parts.filter(isTextUIPart).map(p => p.text).join("");
    const defaultName = textContent.split(" ").slice(0, 6).join(" ");
    const [name, setName] = useState(defaultName ? `Branch from "${defaultName}..."` : "New Branch");
    
    const { mutate: createBranch, isPending } = useCreateBranch(conversationId);

    const handleCreate = () => {
        createBranch({ fromMessageId: message.id, name }, {
            onSuccess: () => setOpen(false)
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <MessageActions className="opacity-0 group-hover:opacity-100 transition-opacity">
                <DialogTrigger asChild>
                    <MessageAction tooltip="Branch from here">
                        <GitBranchIcon />
                    </MessageAction>
                </DialogTrigger>
            </MessageActions>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create Branch</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Input 
                        value={name} 
                        onChange={(e) => setName(e.target.value)} 
                        placeholder="Branch name"
                        disabled={isPending}
                    />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
                    <Button onClick={handleCreate} disabled={isPending}>
                        {isPending ? "Creating..." : "Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
