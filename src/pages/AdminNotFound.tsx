import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

/** Shown for unknown `/admin/...` paths so they never fall through to CMS `ContentPage`. */
export default function AdminNotFound() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-lg text-center">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Stránka nenalezena</h1>
      <p className="text-muted-foreground mb-8">Tato adresa v administraci neexistuje.</p>
      <Button asChild>
        <Link to="/admin/statistics">Zpět do administrace</Link>
      </Button>
    </div>
  );
}
