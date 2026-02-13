// Конфиг для Telegram Mini App (ключи из Supabase Dashboard)
// Внимание: service_role даёт полный доступ к БД и виден в браузере. По возможности используйте только anon + RLS.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://wzpywfedbowlosmvecos.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6cHl3ZmVkYm93bG9zbXZlY29zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNTAyMzksImV4cCI6MjA4MTkyNjIzOX0.TmAYsmA8iwSpLPKOHIZM7jf3GLE3oeT7wD-l0ALwBPw',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6cHl3ZmVkYm93bG9zbXZlY29zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjM1MDIzOSwiZXhwIjoyMDgxOTI2MjM5fQ.mzhh4g_DUpwQUtE2_-tGitSCW9ry2WRHYg-f-MSPt1Q',
  STORAGE_BUCKET_CHECKS: 'checks'
};
