"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { todayISO } from "./format";

/** Today's date (YYYY-MM-DD), set after mount so prerender stays stable. */
export function useTodayState(): [string, Dispatch<SetStateAction<string>>] {
  const [date, setDate] = useState("");
  useEffect(() => {
    setDate((prev) => prev || todayISO());
  }, []);
  return [date, setDate];
}

/** First day of the current month, set after mount. */
export function useMonthStartState(): [string, Dispatch<SetStateAction<string>>] {
  const [date, setDate] = useState("");
  useEffect(() => {
    setDate((prev) => {
      if (prev) return prev;
      const d = new Date();
      d.setDate(1);
      return d.toISOString().slice(0, 10);
    });
  }, []);
  return [date, setDate];
}
