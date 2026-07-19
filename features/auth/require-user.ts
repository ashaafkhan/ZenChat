"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function requireUser(){
    const {userId} = await auth.protect();

    const user = await prisma.user.findUnique({
        where:{clerkId:userId},
    });

    if(!user){
        throw new Error("User not found. Complete onboarding first.");
    }
    return user;
}