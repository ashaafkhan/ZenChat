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
    conversationId?: string;
    branchId?: string;
    initialMessages?: UIMessage[];
};

export const ConversationView = ({ conversationId, branchId, initialMessages = [] }: ConversationViewProps) => {


    const queryClient = useQueryClient();
    const {data:conversations} = useConversations();
    
    // We generate client-side IDs for the first message if none are provided
    const [cId] = React.useState(() => conversationId ?? `c_${Math.random().toString(36).substring(2, 10)}`);
    const [bId] = React.useState(() => branchId ?? `b_${Math.random().toString(36).substring(2, 10)}`);

    const transport = useMemo(() => new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({messages}) => ({
            body: {
                branchId: bId,
                conversationId: cId,
                message: messages.at(-1)
            }
        })
    }),[bId, cId]);

    const { messages, sendMessage, status } = useChat({
        id: cId,
        messages: initialMessages,
        transport,
        onFinish: () => {
            void queryClient.invalidateQueries({
                queryKey: queryKeys.conversations.all,
            });
            // Update the URL to the new conversation if we are on the root page
            if (!conversationId) {
                window.history.replaceState({}, "", `/c/${cId}?branch=${bId}`);
            }
        },
        onError: (error) => {
            toast.error(error.message);
        },
    })

    const title =
        conversations?.find((item) => item.id === cId)?.title ?? "New Chat";

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 overflow-hidden">
                <SidebarTrigger />
                <Separator orientation="vertical" className="mx-1 h-4" />
                <BranchSwitcher 
                    conversationId={cId} 
                    activeBranchId={bId} 
                    title={title} 
                    messages={messages}
                />
            </header>

            {messages.length === 0 ? (
                <ChatEmpty />
            ) : (
                <ChatMessages conversationId={cId} messages={messages} status={status} />
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

