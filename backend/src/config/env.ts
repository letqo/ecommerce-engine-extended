import { z } from 'zod'
import dotenv from 'dotenv'
dotenv.config()

const envSchema = z.object({
  PORT: z.string().default('4000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  DIRECT_DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_CUSTOMER_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_CUSTOMER_EXPIRES_IN: z.string().default('7d'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_PUBLISHABLE_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('noreply@precisie.eu'),
  EMAIL_FROM_NAME: z.string().default('Store'),
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
  BACKEND_URL: z.string().default('http://localhost:4000'),
  STORE_URL: z.string().default('http://localhost:3000'),
  // Comma-separated extra storefront origins (additional stores on their own domains) allowed by CORS.
  STORE_URLS: z.string().default(''),
  ADMIN_URL: z.string().default('http://localhost:3001'),
  CJ_API_KEY: z.string().default(''),
  CJ_API_BASE_URL: z.string().default('https://developers.cjdropshipping.com/api2.0'),
  ALIEXPRESS_APP_KEY: z.string().default(''),
  ALIEXPRESS_APP_SECRET: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  REMOVEBG_API_KEY: z.string().default(''),
  REPLICATE_API_TOKEN: z.string().default(''),
  GOOGLE_AI_API_KEY: z.string().default(''),
})

export const env = envSchema.parse(process.env)
