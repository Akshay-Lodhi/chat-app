import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";
import { phoneNumber } from "better-auth/plugins";

const prisma = new PrismaClient();

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5000",
    trustedOrigins: [
        process.env.FRONTEND_URL, 
        "http://localhost:3000", 
        "http://127.0.0.1:3000",
        "https://chat-app-two-khaki-va269vxf6w.vercel.app"
    ].filter(Boolean) as string[],
    advanced: {
        defaultCookieAttributes: {
            sameSite: "none",
            secure: true,
        }
    },
    database: prismaAdapter(prisma, {
        provider: "postgresql", 
    }),
    plugins: [
        phoneNumber({
            sendOTP: async ({ phoneNumber, code }, request) => {
                console.log(`\n=== MOCK SMS ===\nSending OTP ${code} to ${phoneNumber}\n===============\n`);
            },
            verifyOTP: async ({ phoneNumber, code }) => {
                // Hardcode 4321 as a valid OTP for easy testing
                return code === '4321';
            }
        })
    ],
    emailAndPassword: {
        enabled: false
    }
});
