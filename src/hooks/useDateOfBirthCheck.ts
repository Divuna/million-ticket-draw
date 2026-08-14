import React, { useCallback, createContext, useContext } from 'react';

/**
 * Datum narození se už při registraci nevyžaduje ani neukládá a nikoho neblokuje.
 * Tento provider zůstává zachovaný jen kvůli zpětné kompatibilitě importů
 * (App.tsx wrapper, DateOfBirthGuard). Neprovádí žádný databázový dotaz a nikdy
 * neblokuje přihlášeného uživatele kvůli chybějícímu datu narození.
 *
 * Sloupec `profiles.date_of_birth` v databázi zůstává nedotčen; stará uložená
 * data se nemění a čtou se jinde (admin přehledy, profil).
 */
interface DateOfBirthCheckResult {
  isLoading: boolean;
  hasDateOfBirth: boolean | null;
  dateOfBirth: string | null;
  setDateOfBirthOptimistic: (dob: string) => void;
}

const NOOP_VALUE: DateOfBirthCheckResult = {
  isLoading: false,
  hasDateOfBirth: null,
  dateOfBirth: null,
  setDateOfBirthOptimistic: () => {},
};

const DateOfBirthContext = createContext<DateOfBirthCheckResult | null>(null);

export const DateOfBirthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const setDateOfBirthOptimistic = useCallback((_dob: string) => {
    // No-op: datum narození se už neukládá při registraci.
  }, []);

  const value: DateOfBirthCheckResult = { ...NOOP_VALUE, setDateOfBirthOptimistic };

  return React.createElement(DateOfBirthContext.Provider, { value }, children);
};

export const useDateOfBirthCheck = (): DateOfBirthCheckResult => {
  const context = useContext(DateOfBirthContext);
  if (!context) {
    throw new Error('useDateOfBirthCheck must be used within a DateOfBirthProvider');
  }
  return context;
};
