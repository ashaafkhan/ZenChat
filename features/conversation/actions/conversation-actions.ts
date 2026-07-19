"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/require-user";
import { prisma } from "@/lib/db";

export type ConversationListItem = {
    id: string;
    title: string;
    isPinned: boolean;
    isArchived: boolean;
    lastMessageAt: Date;
    createdAt: Date;
    updatedAt: Date;
};

async function assertOwnsConversation(conversationId: string, userId: string) {
    const conversation = await prisma.conversation.findFirst({
        where: {
            id: conversationId,
            userId
        },
    });

    if (!conversation) {
        throw new Error("Conversation not found");
    }

    return conversation;
}

export async function listConversations():Promise<ConversationListItem[]> {
    const user = await requireUser();

    return prisma.conversation.findMany({
        where: { userId: user.id, isArchived: false },
        orderBy: [{ isPinned: 'desc' }, { lastMessageAt: 'desc' }],
        select: {
            id: true,
            title: true,
            isPinned: true,
            isArchived: true,
            lastMessageAt: true,
            createdAt: true,
            updatedAt: true,
        },
    });
}


export async function createConversation(title = "New Chat") {
    const user = await requireUser();

    return prisma.conversation.create({
        data: {
            userId: user.id,
            title: title.trim() || "New Chat",
        },
    });
}

export async function deleteConversation(conversationId: string) {
    const user = await requireUser();
    await assertOwnsConversation(conversationId, user.id);

    await prisma.conversation.delete({
        where: {
            id: conversationId,
        },
    });

    revalidatePath("/");
    return { id: conversationId };
}