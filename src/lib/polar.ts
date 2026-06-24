import { Polar } from "@polar-sh/sdk";

export const polarClient = new Polar({
    accessToken: process.env.POLAR_ACCESS_TOKEN,
    // F-09: default to sandbox; set POLAR_SERVER=production in the prod env.
    server: process.env.POLAR_SERVER === "production" ? "production" : "sandbox",
})