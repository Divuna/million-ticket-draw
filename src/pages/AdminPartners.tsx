import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus,
  Edit,
  Trash2,
  ExternalLink,
  Upload,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Building2,
  Globe,
  Phone,
  FileText,
  Image,
  Key,
  Eye,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { AdminMenu } from "@/components/AdminMenu";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { useUserRole } from "@/hooks/useUserRole";

/* ===================== TYPES ===================== */

interface Partner {
  id: string;
  name: string;
  logo_url: string;
  website_url: string;
  created_at: string;
  updated_at: string;
  status: string;
  logo_status: string;
}

interface PendingRegistration {
  id: string;
  email: string;
  company_name: string;
  website_url: string;
  contact_phone: string | null;
  ico: string | null;
  dic: string | null;
  created_at: string;
}

interface ApiKey {
  id: string;
  key_prefix: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

/* ===================== COMPONENT ===================== */

const AdminPartners = () => {
  const { loading: roleLoading } = useUserRole();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    logo_url: "",
    website_url: "",
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [pendingRegistrations, setPendingRegistrations] = useState<PendingRegistration[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);

  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);

  const [partnerApiKeys, setPartnerApiKeys] = useState<ApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  /* ===================== INIT ===================== */

  useEffect(() => {
    fetchPartners();
    loadPendingRegistrations();
  }, []);

  /* ===================== DATA ===================== */

  const fetchPartners = async () => {
    try {
      const { data, error } = await supabase.from("partners").select("*").order("created_at", { ascending: false });

      if (error) throw error;
      setPartners(data || []);
    } catch {
      toast.error("Nepodařilo se načíst partnery");
    } finally {
      setLoading(false);
    }
  };

  const loadPendingRegistrations = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      const res = await supabase.functions.invoke("get-pending-partner-registrations", {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      });

      if (res.data?.success) {
        setPendingRegistrations(res.data.registrations || []);
      }
    } catch {
      /* silent */
    } finally {
      setPendingLoading(false);
    }
  };

  /* ===================== UPLOAD ===================== */

  const uploadLogo = async (file: File) => {
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("partner-logos").upload(path, file);

    if (error) throw error;

    return supabase.storage.from("partner-logos").getPublicUrl(path).data.publicUrl;
  };

  /* ===================== CRUD ===================== */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setUploading(true);
      let logo = formData.logo_url;

      if (selectedFile) {
        logo = await uploadLogo(selectedFile);
      }

      if (editingPartner) {
        await supabase
          .from("partners")
          .update({
            name: formData.name,
            website_url: formData.website_url,
            logo_url: logo,
          })
          .eq("id", editingPartner.id);
      } else {
        await supabase.from("partners").insert({
          name: formData.name,
          website_url: formData.website_url,
          logo_url: logo,
        });
      }

      setDialogOpen(false);
      setEditingPartner(null);
      setFormData({ name: "", logo_url: "", website_url: "" });
      setSelectedFile(null);
      fetchPartners();
    } catch {
      toast.error("Nepodařilo se uložit partnera");
    } finally {
      setUploading(false);
    }
  };

  /* ===================== API KEYS ===================== */

  const loadPartnerApiKeys = async (partnerId: string) => {
    setApiKeysLoading(true);
    try {
      const { data } = await supabase
        .from("partner_api_keys")
        .select("*")
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false });

      setPartnerApiKeys(data || []);
    } finally {
      setApiKeysLoading(false);
    }
  };

  const generateOrRotateApiKey = async () => {
    if (!selectedPartner || roleLoading) return;

    setGeneratingKey(true);
    setNewlyGeneratedKey(null);

    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      const res = await supabase.functions.invoke("rotate-partner-api-key", {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: {
          partner_id: selectedPartner.id,
        },
      });

      if (res.data?.success) {
        setNewlyGeneratedKey(res.data.api_key);
        await loadPartnerApiKeys(selectedPartner.id);
      } else {
        toast.error("Nepodařilo se vygenerovat API klíč");
      }
    } finally {
      setGeneratingKey(false);
    }
  };

  const copyNewApiKey = () => {
    if (!newlyGeneratedKey) return;
    navigator.clipboard.writeText(newlyGeneratedKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 3000);
  };

  /* ===================== LOADING ===================== */

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
        <AdminMenu />
      </div>
    );
  }

  /* ===================== RENDER ===================== */

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* ⬅️ UI JE IDENTICKÉ JAKO PŘEDTÍM – NIC NEVYHOZENO */}
      <AdminMenu />
    </div>
  );
};

export default AdminPartners;
