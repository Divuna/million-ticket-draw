import logo from "@/assets/redesign/onemil-logo.png";

/**
 * Načítací obrazovka aplikace (deska Načítání, krok 1): logo „dýchá“, po zlaté liště
 * běží světlo, v pozadí se pomalu točí paprsky. Jen vzhled – žádná logika.
 */
export function AppLoadingScreen() {
  return (
    <div className="om-load" role="status" aria-live="polite">
      <span aria-hidden="true" className="om-load-rays" />
      <div className="om-load-logo">
        <img src={logo} alt="OneMil" />
        <span aria-hidden="true" className="om-load-shine">
          <i />
        </span>
      </div>
      <div role="progressbar" aria-label="Načítání" className="om-load-bar">
        <span />
      </div>
      <span className="om-load-label">NAČÍTÁNÍ</span>
    </div>
  );
}

export default AppLoadingScreen;
