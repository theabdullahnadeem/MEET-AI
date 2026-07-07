import { polarClient } from "@polar-sh/better-auth";
import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
    plugins: [
        polarClient(),
        // C.7: when a 2FA-enabled user signs in, better-auth answers with a
        // twoFactorRedirect instead of a session — send them to the challenge.
        twoFactorClient({
            onTwoFactorRedirect() {
                window.location.href = "/two-factor";
            },
        }),
    ]
});
