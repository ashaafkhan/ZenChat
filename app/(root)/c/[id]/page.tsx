import { loadChatMessages } from '@/features/ai/actions/chat-store';
import { getConversation } from '@/features/conversation/actions/conversation-actions';
import { ConversationView } from '@/features/conversation/components/conversation-view';
import { notFound } from 'next/navigation';
import React from 'react';

import { getRootBranch } from '@/features/branches/actions/branch-actions';

type ConversationPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ branch?: string }>;
};

const page = async ({ params, searchParams }: ConversationPageProps) => {
  const { id } = await params;
  const { branch } = await searchParams;

  let branchId = branch;

  try {
    await getConversation(id)
    if (!branchId) {
       const root = await getRootBranch(id);
       branchId = root.id;
    }
  } catch (error) {
    notFound()
  }

  const initialMessages = await loadChatMessages(branchId!);

  return (
    <ConversationView
      key={id}
      conversationId={id}
      branchId={branchId!}
      initialMessages={initialMessages}
    />
  )
}

export default page