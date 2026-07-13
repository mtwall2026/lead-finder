import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

export const { handlers, auth, signIn, signOut } = NextAuth({
  logger: {
    error(error) { console.error('[NextAuth Error]', error); },
  },
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      authorization: {
        params: {
          scope: 'openid profile email offline_access Files.ReadWrite User.Read Mail.ReadWrite',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign-in — store all token fields
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }

      // Token still valid (with 60s buffer)
      if (Date.now() < (token.expiresAt as number) * 1000 - 60_000) {
        return token;
      }

      // Refresh the access token
      try {
        const res = await fetch(
          `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id:     process.env.AZURE_AD_CLIENT_ID!,
              client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
              grant_type:    'refresh_token',
              refresh_token: token.refreshToken as string,
              scope: 'openid profile email offline_access Files.ReadWrite User.Read Mail.ReadWrite',
            }),
          }
        );
        const tokens = await res.json();
        if (!res.ok) throw tokens;
        return {
          ...token,
          accessToken:  tokens.access_token,
          refreshToken: tokens.refresh_token ?? token.refreshToken,
          expiresAt:    Math.floor(Date.now() / 1000) + (tokens.expires_in as number),
          error: undefined,
        };
      } catch (err) {
        console.error('[NextAuth] Token refresh failed', err);
        return { ...token, error: 'RefreshAccessTokenError' };
      }
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      if (token.error) (session as Record<string, unknown>).error = token.error;
      return session;
    },
  },
});
