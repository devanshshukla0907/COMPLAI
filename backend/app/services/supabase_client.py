from supabase import create_client, Client
from app.core.config import settings

# Initialize Supabase client
# The service_role key has super admin privileges. Use with caution.
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)