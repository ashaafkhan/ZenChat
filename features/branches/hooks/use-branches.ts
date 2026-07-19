"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { queryKeys } from "@/features/conversation/utils/query-keys";
import { 
    createBranch, 
    deleteBranch, 
    listBranches, 
    renameBranch 
} from "@/features/branches/actions/branch-actions";

export function useBranches(conversationId: string) {
    return useQuery({
        queryKey: queryKeys.branches.byConversation(conversationId),
        queryFn: () => listBranches(conversationId),
    });
}

export function useCreateBranch(conversationId: string) {
    const queryClient = useQueryClient();
    const router = useRouter();

    return useMutation({
        mutationFn: ({ fromMessageId, name }: { fromMessageId: string; name?: string }) => 
            createBranch(conversationId, fromMessageId, name),
        onSuccess: (branch) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.branches.byConversation(conversationId),
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.messages.byConversation(conversationId),
            });
            router.push(`/c/${conversationId}?branch=${branch.id}`);
        },
        onError: (error: Error) => {
            toast.error(error.message || "Could not create branch");
        },
    });
}

export function useRenameBranch(conversationId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ branchId, name }: { branchId: string; name: string }) => 
            renameBranch(branchId, name),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.branches.byConversation(conversationId),
            });
        },
        onError: (error: Error) => {
            toast.error(error.message || "Could not rename branch");
        },
    });
}

export function useDeleteBranch(conversationId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (branchId: string) => deleteBranch(branchId),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.branches.byConversation(conversationId),
            });
        },
        onError: (error: Error) => {
            toast.error(error.message || "Could not delete branch");
        },
    });
}
