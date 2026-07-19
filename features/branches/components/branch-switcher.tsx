"use client";

import { useBranches, useCreateBranch, useDeleteBranch, useRenameBranch } from "../hooks/use-branches";
import { 
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, 
    DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent
} from "@/components/ui/dropdown-menu";
import { 
    Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator 
} from "@/components/ui/breadcrumb";
import { 
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GitBranchIcon, ChevronDownIcon, MoreHorizontalIcon, Trash2Icon, Edit2Icon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { UIMessage } from "ai";
import { toast } from "sonner";

type BranchSwitcherProps = {
    conversationId: string;
    activeBranchId: string;
    title: string;
    messages: UIMessage[];
};

export const BranchSwitcher = ({ conversationId, activeBranchId, title, messages }: BranchSwitcherProps) => {
    const { data: branches, isLoading } = useBranches(conversationId);
    const router = useRouter();
    const { mutate: createBranch, isPending: isCreating } = useCreateBranch(conversationId);
    const { mutate: renameBranch, isPending: isRenaming } = useRenameBranch(conversationId);
    const { mutateAsync: deleteBranch, isPending: isDeleting } = useDeleteBranch(conversationId);

    const [renameOpen, setRenameOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<{ id: string, name: string } | null>(null);
    const [newName, setNewName] = useState("");

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ id: string, name: string } | null>(null);

    // Compute depth for indentation
    const branchesWithDepth = useMemo(() => {
        if (!branches) return [];
        const depthMap = new Map<string, number>();
        const getDepth = (id: string): number => {
            if (depthMap.has(id)) return depthMap.get(id)!;
            const branch = branches.find(b => b.id === id);
            if (!branch || !branch.parentBranchId) {
                depthMap.set(id, 0);
                return 0;
            }
            const depth = getDepth(branch.parentBranchId) + 1;
            depthMap.set(id, depth);
            return depth;
        };
        
        return branches.map(b => ({
            ...b,
            depth: getDepth(b.id)
        })).sort((a, b) => {
            // Sort by depth, then by createdAt
            if (a.depth === b.depth) {
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            }
            return a.depth - b.depth;
        });
    }, [branches]);

    // Lineage for breadcrumb
    const lineage = useMemo(() => {
        if (!branches) return [];
        const path = [];
        let current = branches.find(b => b.id === activeBranchId);
        while (current) {
            path.unshift(current);
            const parentId = current.parentBranchId; // capture before reassigning current
            current = branches.find(b => b.id === parentId);
        }
        return path;
    }, [branches, activeBranchId]);

    const handleNewBranchFromHere = () => {
        const lastMessage = messages.at(-1);
        if (!lastMessage) {
            toast.error("Cannot branch an empty conversation");
            return;
        }
        createBranch({ fromMessageId: lastMessage.id });
    };

    const handleRename = () => {
        if (!renameTarget) return;
        renameBranch({ branchId: renameTarget.id, name: newName }, {
            onSuccess: () => {
                setRenameOpen(false);
                setRenameTarget(null);
            }
        });
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteBranch(deleteTarget.id);
            setDeleteOpen(false);
            if (deleteTarget.id === activeBranchId) {
                const root = branches?.find(b => b.parentBranchId === null);
                if (root) {
                    router.push(`/c/${conversationId}?branch=${root.id}`);
                }
            }
            setDeleteTarget(null);
        } catch (error) {
            // Error is handled by hook's onError Sonner toast
        }
    };

    if (isLoading) {
        return <Skeleton className="h-6 w-32" />;
    }

    return (
        <div className="flex items-center gap-2 overflow-hidden">
            <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 px-2 flex items-center gap-2 max-w-sm" />}>
                    <GitBranchIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{lineage.at(-1)?.name || "Branch"}</span>
                    <ChevronDownIcon className="h-4 w-4 shrink-0 opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 max-h-[70vh] overflow-y-auto">
                    <DropdownMenuLabel className="truncate opacity-70 font-normal">
                        {title}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {branchesWithDepth.map(branch => {
                        const isActive = branch.id === activeBranchId;
                        return (
                            <DropdownMenuItem 
                                key={branch.id} 
                                className="flex items-center justify-between"
                                onSelect={() => {
                                    if (!isActive) {
                                        router.push(`/c/${conversationId}?branch=${branch.id}`);
                                    }
                                }}
                            >
                                <div className="flex items-center gap-2 truncate" style={{ paddingLeft: `${branch.depth * 12}px` }}>
                                    <span className={isActive ? "font-semibold" : ""}>{branch.name}</span>
                                </div>
                                {!branch.parentBranchId ? null : (
                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger render={
                                            <div onClick={(e) => e.stopPropagation()} className="p-1 cursor-pointer rounded hover:bg-accent opacity-50 hover:opacity-100" />
                                        }>
                                            <MoreHorizontalIcon className="h-4 w-4" />
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                            <DropdownMenuItem onClick={(e) => {
                                                e.stopPropagation();
                                                setRenameTarget({ id: branch.id, name: branch.name });
                                                setNewName(branch.name);
                                                setRenameOpen(true);
                                            }}>
                                                <Edit2Icon className="h-4 w-4 mr-2" />
                                                Rename
                                            </DropdownMenuItem>
                                            <DropdownMenuItem 
                                                className="text-destructive focus:text-destructive"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeleteTarget({ id: branch.id, name: branch.name });
                                                    setDeleteOpen(true);
                                                }}>
                                                <Trash2Icon className="h-4 w-4 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                )}
                            </DropdownMenuItem>
                        );
                    })}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={handleNewBranchFromHere} disabled={isCreating || messages.length === 0}>
                        <PlusIcon className="h-4 w-4 mr-2" />
                        New branch from here
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Breadcrumb className="hidden sm:flex truncate text-xs text-muted-foreground ml-2">
                <BreadcrumbList>
                    {lineage.map((branch, i) => (
                        <div key={branch.id} className="flex items-center gap-2">
                            {i > 0 && <BreadcrumbSeparator />}
                            <BreadcrumbItem>
                                <span className={i === lineage.length - 1 ? "font-semibold text-foreground" : "truncate max-w-[100px]"}>
                                    {branch.name}
                                </span>
                            </BreadcrumbItem>
                        </div>
                    ))}
                </BreadcrumbList>
            </Breadcrumb>

            {/* Modals */}
            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename Branch</DialogTitle>
                    </DialogHeader>
                    <Input 
                        value={newName} 
                        onChange={e => setNewName(e.target.value)} 
                        disabled={isRenaming} 
                    />
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setRenameOpen(false)} disabled={isRenaming}>Cancel</Button>
                        <Button onClick={handleRename} disabled={isRenaming}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the branch "{deleteTarget?.name}" and all its messages.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                            {isDeleting ? "Deleting..." : "Delete"}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
