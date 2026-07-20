"use client";

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@base-ui/react/separator';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from "@ai-sdk/react";
import React, { useMemo } from 'react';
import { useConversations } from '../hooks/use-conversation';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../utils/query-keys';
import { toast } from 'sonner';
import { ChatEmpty } from './chat-empty';
import { ChatMessages } from './chat-messages';
import { ChatComposer } from './chat-composer';
import { BranchSwitcher } from '@/features/branches/components/branch-switcher';

type ConversationViewProps = {
    conversationId: string;
    branchId: string;
    initialMessages: UIMessage[];
};

export const ConversationView = ({ conversationId, branchId, initialMessages }: ConversationViewProps) => {


    const queryClient = useQueryClient();
    const {data:conversations} = useConversations();
    
    const transport = useMemo(() => new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({messages}) => ({
            body: {
                branchId, message: messages.at(-1)
            }
        })
    }),[branchId]);

    const { messages, sendMessage, status } = useChat({
        id: conversationId,
        messages: initialMessages,
        transport,
        onFinish: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.all,
            });
        },
        onError: (error) => {
            toast.error(error.message);
        },
    })

    const title =
        conversations?.find((item) => item.id === conversationId)?.title ?? "Chat";

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 overflow-hidden">
                <SidebarTrigger />
                <Separator orientation="vertical" className="mx-1 h-4" />
                <BranchSwitcher 
                    conversationId={conversationId} 
                    activeBranchId={branchId} 
                    title={title} 
                    messages={messages}
                />
            </header>

            {messages.length === 0 ? (
                <ChatEmpty />
            ) : (
                <ChatMessages conversationId={conversationId} messages={messages} status={status} />
            )}

            <ChatComposer
                onSend={(text) => {
                    void sendMessage({ text });
                }}
                isSending={status !== "ready"}
                autoFocus
            />
        </div>
    )
}

