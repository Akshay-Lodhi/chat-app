import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:5000",
    plugins: [
        phoneNumberClient()
    ]
});

export const { useSession, signIn, signUp, signOut } = authClient;
