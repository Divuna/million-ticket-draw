import { useEffect, useState } from "react";
import { supabase } from "../integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Loader2 } from "lucide-react";
import { useUserRole } from "../hooks/useUserRole";

type Partner = {
  id: string;
  name: string;
  status: string;
  logo_status: string;
  logo_url: string | null;
};

type PartnerApiKey = {
  id: string;
  key_prefix: string;
  revoked_at: string | null;
  created_at: string;
};

const AdminPartners = () => {
  const { loading: roleLoading, isAdmin } = useUserRole();

  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  const [partnerApiKeys, setPartnerApiKeys] = useState<PartnerApiKey[]>([]);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);

  /* ===========================
     LOAD PARTNERS
  =========================== */
  const loadPartners = async () => {
    setLoading(true);

    const { data, error } = await supabase.from("partners").select("*").order("created_at", { ascending: false });

    if (error) {
      toast.error("Nepodařilo se načíst partnery");
      console.error(error);
    } else {
      setPartners(data || []);
    }

    setLoading(false);
  };

  /* ===========================
     LOAD API KEYS
  =========================== */
  const loadPartnerApiKeys = async (partnerId: string) => {
    const { data, error } = await supabase
      .from("partner_api_keys")
      .select("*")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Nepodařilo se načíst API klíče");
      console.error(error);
    } else {
      setPartnerApiKeys(data || []);
    }
  };

  /* ===========================
     GENERATE / ROTATE API KEY
     (EDGE FUNCTION via FETCH)
  =========================== */
  const generateOrRotateApiKey = async () => {
    if (!selectedPartner) return;

    if (roleLoading) {
      toast.error("Načítání uživatele, zkuste znovu");
      return;
    }

    if (!isAdmin) {
      toast.error("Pouze admin může generovat API klíče");
      return;
    }

    setGeneratingKey(true);
    setNewlyGeneratedKey(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData?.session?.access_token) {
        toast.error("Nejste přihlášen");
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rotate-partner-api-key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          partner_id: selectedPartner.id,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(errText);
        throw new Error(errText || "Chyba při volání Edge Function");
      }

      const result = await response.json();

      if (!result.success || !result.api_key) {
        throw new Error(result.error || "Neplatná odpověď serveru");
      }

      setNewlyGeneratedKey(result.api_key);

      const hadKeyBefore = partnerApiKeys.some((k) => !k.revoked_at);

      toast.success(hadKeyBefore ? "API klíč byl rotován (starý zneplatněn)" : "API klíč byl vygenerován");

      await loadPartnerApiKeys(selectedPartner.id);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Nepodařilo se vygenerovat API klíč");
    } finally {
      setGeneratingKey(false);
    }
  };

  /* ===========================
     EFFECTS
  =========================== */
  useEffect(() => {
    loadPartners();
  }, []);

  useEffect(() => {
    if (selectedPartner) {
      loadPartnerApiKeys(selectedPartner.id);
    } else {
      setPartnerApiKeys([]);
    }
  }, [selectedPartner]);

  /* ===========================
     LOADING
  =========================== */
  if (loading || roleLoading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  /* ===========================
     RENDER
  =========================== */
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Partneři</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-4 space-y-2">
          {partners.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedPartner(p)}
              className={`p-2 rounded cursor-pointer ${
                selectedPartner?.id === p.id ? "bg-muted" : "hover:bg-muted/50"
              }`}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-muted-foreground">
                status: {p.status}, logo: {p.logo_status}
              </div>
            </div>
          ))}
        </Card>

        {selectedPartner && (
          <Card className="p-4 space-y-4">
            <h2 className="text-lg font-semibold">{selectedPartner.name}</h2>

            <Button onClick={generateOrRotateApiKey} disabled={generatingKey || selectedPartner.status !== "approved"}>
              {generatingKey && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {partnerApiKeys.some((k) => !k.revoked_at) ? "Rotovat API klíč" : "Vygenerovat API klíč"}
            </Button>

            {newlyGeneratedKey && (
              <div className="rounded bg-black text-green-400 p-3 font-mono break-all">{newlyGeneratedKey}</div>
            )}

            <div className="text-sm text-muted-foreground">API klíče:</div>

            {partnerApiKeys.map((k) => (
              <div key={k.id} className="text-sm flex justify-between">
                <span>{k.key_prefix}••••••</span>
                <span>{k.revoked_at ? "neplatný" : "aktivní"}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminPartners;
