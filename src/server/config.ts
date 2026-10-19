import dotenv from 'dotenv';

dotenv.config();

function env(key: string, fallback = ''): string {
  return process.env[key]?.trim() || fallback;
}

function envBool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v == null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const config = {
  port: Number(env('PORT', '8080')),
  supabaseUrl: env('SUPABASE_URL'),
  supabaseAnonKey: env('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  serperApiKey: env('SERPER_API_KEY') || env('SERPER_KEY') || env('serper_api_key'),
  apifyToken: env('APIFY_TOKEN') || env('APIFY_API_TOKEN') || env('apify_token'),
  apifyMaxUsd: Number(env('APIFY_MAX_USD', '2')) || 2,
  findNamedPersonUrl: env('FIND_NAMED_PERSON_URL'),
  findNamedPersonClientTag: env('FIND_NAMED_PERSON_CLIENT_TAG', 'business_owners'),
  writesEnabled: envBool('OWNER_LOOKUP_WRITES', false),
};

export type AppConfig = typeof config;

export function hasSupabase(): boolean {
  return Boolean(config.supabaseUrl && (config.supabaseServiceRoleKey || config.supabaseAnonKey));
}
