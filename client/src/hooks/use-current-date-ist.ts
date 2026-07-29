import { useState, useEffect, useRef } from "react";
import { getTodayIST } from "@/lib/date-utils";

// IST is UTC+5:30 with no DST — offset is constant.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Returns ms until the next IST midnight (plus a 500 ms buffer to land after). */
function msUntilISTMidnight(): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const istTimeOfDayMs = (Date.now() + IST_OFFSET_MS) % dayMs;
  return dayMs - istTimeOfDayMs + 500;
}

/**
 * Returns today's date as a YYYY-MM-DD string in IST.
 *
 * Re-renders subscribers once at IST midnight so any component using this
 * hook automatically sees the new date without a page reload.
 *
 * The `changed` flag in the returned value is `false` on initial mount and
 * `true` only after a real midnight transition, letting callers skip resetting
 * user-selected values on the very first render.
 */
export function useCurrentDateIST(): { today: string; changed: boolean } {
  const [today, setToday] = useState<string>(getTodayIST);
  const changedRef = useRef(false);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function scheduleReset() {
      timer = setTimeout(() => {
        changedRef.current = true;
        setToday(getTodayIST());
        setChanged(true);
        scheduleReset(); // reschedule for the following midnight
      }, msUntilISTMidnight());
    }

    scheduleReset();
    return () => clearTimeout(timer);
  }, []);

  return { today, changed };
}
