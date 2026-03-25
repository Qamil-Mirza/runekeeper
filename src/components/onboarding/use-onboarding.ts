"use client";

import { useState, useEffect, useCallback } from "react";
import * as api from "@/lib/api-client";

const STORAGE_KEY = "rk_onboarding_completed";

function isCompletedInStorage(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Fast path: localStorage says completed
    if (isCompletedInStorage()) {
      setChecked(true);
      return;
    }

    // Slow path: check DB via API
    api
      .fetchUserPreferences()
      .then((prefs) => {
        if (prefs?.preferences?.onboardingCompleted) {
          localStorage.setItem(STORAGE_KEY, "true");
        } else {
          setShowOnboarding(true);
        }
      })
      .catch(() => {
        // If fetch fails, show onboarding to be safe
        setShowOnboarding(true);
      })
      .finally(() => setChecked(true));
  }, []);

  const completeOnboarding = useCallback(() => {
    setShowOnboarding(false);
    localStorage.setItem(STORAGE_KEY, "true");
    api.updateUserPreferences({ onboardingCompleted: true }).catch(() => {});
  }, []);

  return { showOnboarding: checked && showOnboarding, completeOnboarding };
}
