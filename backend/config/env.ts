const origin = process.env.FRONTEND_ORIGIN || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') || 'http://localhost:3000';

export const settings = {
  databaseUrl: process.env.DATABASE_URL?.trim().replace(/^(?:"(.*)"|'(.*)')$/, '$1$2') || '',
  frontendOrigin: new URL(origin).origin,
  secureCookies: process.env.SESSION_COOKIE_SECURE === 'true' || (process.env.SESSION_COOKIE_SECURE !== 'false' && origin.startsWith('https:')),
};
