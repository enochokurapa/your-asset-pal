import { supabase } from "@/integrations/supabase/client";

export async function getServerAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  return { Authorization: `Bearer ${session.access_token}` };
}
