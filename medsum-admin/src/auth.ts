import { betterAuth } from 'better-auth'

export const auth = betterAuth({
  socialProviders: {
    microsoft: {
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID as string,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET as string,
      tenantId: process.env.AUTH_MICROSOFT_ENTRA_TENANT_ID,
    }
  }
})
