"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function requireUser(){
    const {userId} = await auth.protect();

    const clerkUser = await currentUser();

    const user = await prisma.user.upsert({
        where: { clerkId: userId },
        update: {},
        create: {
            clerkId: userId,
            email: clerkUser?.emailAddresses[0]?.emailAddress ?? "",
            name: clerkUser?.fullName ?? clerkUser?.firstName ?? "User",
        },
    });

    return user;
}