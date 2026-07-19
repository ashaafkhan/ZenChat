"use server"

import { requireUser } from "@/features/auth/action/require-user";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function getRootBranch(conversationId: string) {
    const user = await requireUser();
    
    return prisma.branch.findFirstOrThrow({
        where: {
            conversationId,
            parentBranchId: null,
            conversation: {
                userId: user.id
            }
        }
    });
}

export async function listBranches(conversationId: string) {
    const user = await requireUser();
    
    return prisma.branch.findMany({
        where: {
            conversationId,
            conversation: {
                userId: user.id
            }
        },
        orderBy: {
            createdAt: 'asc'
        }
    });
}

export async function getBranchMessages(branchId: string): Promise<any[]> {
    const user = await requireUser();
    
    // We get the branch and ensure ownership
    const branch = await prisma.branch.findUniqueOrThrow({
        where: { 
            id: branchId,
            conversation: {
                userId: user.id
            }
        }
    });

    let inherited: any[] = [];
    if (branch.parentBranchId && branch.branchPointMessageId) {
        const parentMessages = await getBranchMessages(branch.parentBranchId);
        const cutoff = parentMessages.findIndex(
            (m: any) => m.id === branch.branchPointMessageId
        );
        inherited = cutoff >= 0 ? parentMessages.slice(0, cutoff + 1) : parentMessages;
    }

    const own = await prisma.message.findMany({
        where: { branchId },
        orderBy: { createdAt: "asc" },
    });

    return [...inherited, ...own];
}

export async function createBranch(conversationId: string, fromMessageId: string, name?: string) {
    const user = await requireUser();

    // Verify ownership of the conversation and existence of the message
    const message = await prisma.message.findUniqueOrThrow({
        where: {
            id: fromMessageId,
            conversation: {
                id: conversationId,
                userId: user.id
            }
        }
    });

    const defaultName = message.content.split(" ").slice(0, 6).join(" ") || "New Branch";

    const branch = await prisma.branch.create({
        data: {
            conversationId,
            parentBranchId: message.branchId,
            branchPointMessageId: fromMessageId,
            name: name || defaultName
        }
    });

    revalidatePath(`/c/${conversationId}`);
    return branch;
}

export async function renameBranch(branchId: string, name: string) {
    const user = await requireUser();

    const branch = await prisma.branch.update({
        where: {
            id: branchId,
            conversation: {
                userId: user.id
            }
        },
        data: {
            name
        }
    });

    revalidatePath(`/c/${branch.conversationId}`);
    return branch;
}

export async function deleteBranch(branchId: string) {
    const user = await requireUser();

    const branch = await prisma.branch.findUniqueOrThrow({
        where: {
            id: branchId,
            conversation: {
                userId: user.id
            }
        },
        include: {
            children: true
        }
    });

    if (branch.parentBranchId === null) {
        throw new Error("Cannot delete the root branch.");
    }

    if (branch.children.length > 0) {
        throw new Error("Cannot delete a branch with children. Please delete the child branches first.");
    }

    await prisma.branch.delete({
        where: { id: branchId }
    });

    revalidatePath(`/c/${branch.conversationId}`);
    return true;
}
