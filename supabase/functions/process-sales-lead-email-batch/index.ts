import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "npm:resend@6.18.1";
import { createOutboundCapture } from "../_shared/salesLeadEmailThreading.ts";
import { authorizeSalesLeadBatchWorkerRequest } from "../_shared/salesLeadBatchWorkerAuth.ts";
import { runSalesLeadEmailBatchWorker } from "../_shared/salesLeadBatchWorkerRun.ts";
import {
  createResendInitialEmailProvider,
  SALES_LEAD_INITIAL_EMAIL_FROM,
  SALES_LEAD_INITIAL_EMAIL_REPLY_TO,
} from "../_shared/salesLeadInitialEmailSender.ts";

// ============================================================================
// process-sales-lead-email-batch — interní worker připravených dávek (PR 4)
// Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§23, PR 4)
//
// ⚠️ Tato funkce NIKDY nevybírá firmy, nevytváří dávky ani nezapíná automatiku.
//    Zpracuje výhradně položku, kterou člověk předem připravil a schválil, a to
//    nejvýše JEDNU na jeden request. Bez zapnuté automatiky (`enabled=true`)
//    a bez aktivované dávky (`scheduled`) neudělá nic.
//
// Fail-closed bariéry:
//   • jiná metoda než POST            → 405
//   • chybí SALES_LEAD_BATCH_WORKER_SECRET v prostředí → 500, žádná změna
//   • chybný/chybějící Bearer header  → 401
//   • chybí RESEND_API_KEY            → 503 (claim se vůbec nespustí)
//   • vypnutá automatika              → bezpečný no-op
//   • žádná splatná položka           → bezpečný no-op
//
// Autorizace je výhradně interní sdílený secret. Uživatelské JWT ani veřejné
// admin volání se nepoužívá. Funkce nemá plánovač; spouští ji jen samostatně
// schválený operační krok. Vlastní orchestrace je ve sdíleném modulu
// `salesLeadBatchWorkerRun.ts`, aby byla testovatelná bez poskytovatele.
// ============================================================================

const jsonResponse = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req) => {
  // Bez nakonfigurovaného secretu nebo bez správného Bearer headeru se nesmí
  // stát vůbec nic — žádný claim, žádná mutace, žádný poskytovatel.
  const authorized = authorizeSalesLeadBatchWorkerRequest({
    method: req.method,
    authorization: req.headers.get("Authorization"),
    secret: Deno.env.get("SALES_LEAD_BATCH_WORKER_SECRET"),
  });
  if (!authorized.ok) {
    return jsonResponse({ success: false, error: authorized.error }, authorized.status);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error: "worker_not_configured" }, 500);
  }
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    // Nic se neclaimne, dokud není poskytovatel dostupný.
    return jsonResponse({ success: false, error: "email_not_configured" }, 503);
  }

  const result = await runSalesLeadEmailBatchWorker({
    client: createClient(supabaseUrl, serviceRoleKey),
    provider: createResendInitialEmailProvider(new Resend(resendApiKey)),
    newOutboundCaptureId: () => createOutboundCapture().id,
    from: SALES_LEAD_INITIAL_EMAIL_FROM,
    replyTo: SALES_LEAD_INITIAL_EMAIL_REPLY_TO,
  });
  return jsonResponse(result.body, result.status);
});
