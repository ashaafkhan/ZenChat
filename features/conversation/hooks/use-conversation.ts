"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
    createConversation,
    deleteConversation,
    listConversations,
    updateConversation,
} from "@/features/conversation/actions/conversation-actions";
import { queryKeys } from "../utils/query-keys";


export function useConversations() {
    return useQuery({
        queryKey: queryKeys.conversations.all,
        queryFn: () => listConversations(),
    });
}

export function useCreateConversation() {
    const queryClient = useQueryClient();
    const router = useRouter();

    return useMutation({
        mutationFn: (title?: string) => createConversation(title),
        onSuccess: (conversation: Awaited<ReturnType<typeof createConversation>>) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.all,
            });
            router.push(`/c/${conversation.id}?branch=${conversation.branchId}`);
        },
        onError: (error: Error) => {
            toast.error(error.message || "Could not create chat");
        },
    });
}


export function useUpdateConversation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            ...data
        }: {
            id: string;
            title?: string;
            isPinned?: boolean;
            isArchived?: boolean;
        }) => updateConversation(id, data),
        onSuccess: (conversation) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.all,
            });
            void queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.detail(conversation.id),
            });
        },
        onError: (error: Error) => {
            toast.error(error.message || "Failed to update conversation");
        },
    });
}

export function useDeleteConversation(activeId?: string) {
    const queryClient = useQueryClient();
    const router = useRouter();

    return useMutation({
        mutationFn: (id: string) => deleteConversation(id),
        onSuccess: ({ id }) => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.all,
            });
            void queryClient.removeQueries({
                queryKey: queryKeys.messages.byConversation(id),
            });

            if (activeId === id) {
                router.replace("/");
            }

            toast.success("Chat deleted.");
        },
        onError: (error: Error) => {
            toast.error(error.message || "Failed to delete conversation");
        },
    });
}

