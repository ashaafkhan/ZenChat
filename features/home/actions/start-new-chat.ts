"use server";

import { requireUser } from "@/features/auth/action/require-user";
import { prisma } from "@/lib/db";

export async function startNewChat() {
    const user = await requireUser();
    const [conversation, branch] = await prisma.$transaction(async (tx) => {
        const conversation = await tx.conversation.create({
            data: {
                userId: user.id,
                title: "New Chat"
            }
        });
        const branch = await tx.branch.create({
            data: { conversationId: conversation.id, name: "Main" }
        });
        return [conversation, branch];
    });
    return { conversationId: conversation.id, branchId: branch.id };
}