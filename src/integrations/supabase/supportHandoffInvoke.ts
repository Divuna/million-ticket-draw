import { supabase } from "@/integrations/supabase/client"

/**
 * When `VITE_LOCAL_SUPPORT_HANDOFF_URL` is set (e.g. in `.env.local`), POSTs to the local
 * Edge Functions gateway instead of production. Omit the variable in production builds.
 */
export async function invokeSupportHandoff(body: { message: string }): Promise<void> {
  const localUrl = (import.meta.env.VITE_LOCAL_SUPPORT_HANDOFF_URL as string | undefined)?.trim() ?? ""

  if (localUrl) {
    const url = localUrl.replace(
      "http://localhost:54321/functions/v1/support-handoff",
      "https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/support-handoff",
    )
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
    const bearer = session?.access_token ?? anon ?? ""
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon ?? "",
        Authorization: bearer ? `Bearer ${bearer}` : "",
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      let msg = res.statusText
      try {
        const j = (await res.json()) as { error?: string }
        if (typeof j?.error === "string" && j.error) msg = j.error
      } catch {
        // ignore
      }
      throw new Error(msg)
    }
    return
  }

  const { error } = await supabase.functions.invoke("support-handoff", { body })
  if (error) throw error
}
