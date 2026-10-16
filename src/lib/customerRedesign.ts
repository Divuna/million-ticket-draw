/**
 * Zda cesta patří do zákaznické části s novým vizuálem (om-redesign).
 * Stejná pravidla jako `layoutClassName` v App.tsx: admin, partnerský portál,
 * affiliate a influencer zůstávají ve starém vzhledu, stejně jako firemní
 * stránky /pro-eshopy a /partnerstvi.
 */
export function isCustomerRedesignPath(pathname: string): boolean {
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/partner/') ||
    pathname.startsWith('/affiliate') ||
    pathname.startsWith('/influencer')
  ) {
    return false;
  }
  return pathname !== '/pro-eshopy' && pathname !== '/partnerstvi';
}
