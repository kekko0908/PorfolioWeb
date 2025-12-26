interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: string;
  readonly VITE_ALPHA_VANTAGE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
