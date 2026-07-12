import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import {polar, checkout, portal} from "@polar-sh/better-auth"
import { polarClient } from "./polar";
import { authRateLimitStorage } from "./ratelimit";
import { purgeUserData } from "./account-deletion";

if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is not set");
}

export const auth = betterAuth({
    // Shown as the issuer in authenticator apps (C.7 TOTP).
    appName: "MEET-AI",
    secret: process.env.BETTER_AUTH_SECRET,
    // S-3: brute-force protection that actually works on serverless. The
    // built-in special rules already cap sign-in/sign-up at 3 per 10 s, but
    // the default in-memory counters are per-Vercel-instance — backing them
    // with Upstash (customStorage) makes them global. 2FA verification isn't
    // covered by the built-in rules, so it gets explicit caps here.
    rateLimit: {
        customRules: {
            "/two-factor/verify-totp": { window: 60, max: 6 },
            "/two-factor/verify-backup-code": { window: 60, max: 3 },
        },
        // undefined (Upstash not configured) → better-auth's memory store.
        customStorage: authRateLimitStorage,
    },
    plugins: [twoFactor(), polar({
        client: polarClient,
        createCustomerOnSignUp: true,
        use: [
            checkout({
                authenticatedUsersOnly: true,
                successUrl: "/upgrade",
            }),
            portal(),
        ]
    })],
    socialProviders: {
        github: { 
            clientId: process.env.GITHUB_CLIENT_ID as string, 
            clientSecret: process.env.GITHUB_CLIENT_SECRET as string, 
        }, 
        google: { 
            clientId: process.env.GOOGLE_CLIENT_ID as string, 
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string, 
        }, 
     },
    emailAndPassword:{
        enabled: true,
    },
    // S-5: right-to-erasure. Email+password users confirm with their
    // password; social-login users need a fresh session (better-auth's
    // freshness check — sign in again if it errors). The DB rows cascade
    // from the user row; beforeDelete purges what the DB can't reach
    // (R2 media, Stream chat, live rooms, Polar subscription).
    user: {
        deleteUser: {
            enabled: true,
            beforeDelete: async (user) => {
                await purgeUserData(user.id);
            },
        },
    },
    database: drizzleAdapter(db, {
        provider: "pg", 
        schema:{
            ...schema,
        },
    }),
});