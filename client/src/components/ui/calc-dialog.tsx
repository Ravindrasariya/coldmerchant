import { useEffect, useReducer } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";

// ─── State & Reducer ────────────────────────────────────────────────────────

interface CalcState {
  display: string;       // current right-hand operand (shown large)
  prevValue: number | null;
  operator: string | null;
  waitingForSecond: boolean;
  justEvaled: boolean;   // true right after = so next digit starts fresh
}

type CalcAction =
  | { type: "DIGIT"; digit: string }
  | { type: "OPERATOR"; op: string }
  | { type: "EQUALS" }
  | { type: "PERCENT" }
  | { type: "CLEAR" }
  | { type: "BACKSPACE" }
  | { type: "RESET" };

const INITIAL: CalcState = {
  display: "0",
  prevValue: null,
  operator: null,
  waitingForSecond: false,
  justEvaled: false,
};

function compute(a: number, b: number, op: string): number {
  switch (op) {
    case "+": return a + b;
    case "−": return a - b;
    case "×": return a * b;
    case "÷": return b !== 0 ? a / b : 0;
    default: return b;
  }
}

function fmt(n: number): string {
  if (!isFinite(n)) return "0";
  // strip trailing zeros after decimal
  const s = parseFloat(n.toPrecision(10)).toString();
  return s;
}

function calcReducer(state: CalcState, action: CalcAction): CalcState {
  switch (action.type) {
    case "RESET": return { ...INITIAL };

    case "DIGIT": {
      const d = action.digit;
      if (state.waitingForSecond) {
        return {
          ...state,
          display: d === "." ? "0." : d,
          waitingForSecond: false,
          justEvaled: false,
        };
      }
      if (state.justEvaled) {
        return {
          ...state,
          display: d === "." ? "0." : d,
          prevValue: null,
          operator: null,
          justEvaled: false,
        };
      }
      if (d === "." && state.display.includes(".")) return state;
      const next =
        state.display === "0" && d !== "."
          ? d
          : state.display + d;
      return { ...state, display: next };
    }

    case "OPERATOR": {
      const cur = parseFloat(state.display);
      if (state.prevValue !== null && !state.waitingForSecond && state.operator) {
        // chain: resolve pending op first
        const result = compute(state.prevValue, cur, state.operator);
        return {
          ...state,
          display: fmt(result),
          prevValue: result,
          operator: action.op,
          waitingForSecond: true,
          justEvaled: false,
        };
      }
      return {
        ...state,
        prevValue: cur,
        operator: action.op,
        waitingForSecond: true,
        justEvaled: false,
      };
    }

    case "PERCENT": {
      const cur = parseFloat(state.display);
      return { ...state, display: fmt(cur / 100), justEvaled: false };
    }

    case "EQUALS": {
      if (state.prevValue === null || state.operator === null) return state;
      const cur = parseFloat(state.display);
      const result = compute(state.prevValue, cur, state.operator);
      return {
        display: fmt(result),
        prevValue: null,
        operator: null,
        waitingForSecond: false,
        justEvaled: true,
      };
    }

    case "CLEAR": return { ...INITIAL };

    case "BACKSPACE": {
      if (state.waitingForSecond || state.justEvaled) return state;
      const next = state.display.length <= 1 ? "0" : state.display.slice(0, -1);
      return { ...state, display: next };
    }

    default: return state;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

interface CalcDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalcDialog({ open, onOpenChange }: CalcDialogProps) {
  const [state, dispatch] = useReducer(calcReducer, INITIAL);

  // Reset calculator each time it opens
  useEffect(() => {
    if (open) dispatch({ type: "RESET" });
  }, [open]);

  // Keyboard handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      // Let the dialog's own Escape handling work (Radix closes it)
      if (e.key === "Escape") return;

      const key = e.key;
      if (key >= "0" && key <= "9") {
        e.preventDefault();
        dispatch({ type: "DIGIT", digit: key });
      } else if (key === ".") {
        e.preventDefault();
        dispatch({ type: "DIGIT", digit: "." });
      } else if (key === "+") {
        e.preventDefault();
        dispatch({ type: "OPERATOR", op: "+" });
      } else if (key === "-") {
        e.preventDefault();
        dispatch({ type: "OPERATOR", op: "−" });
      } else if (key === "*") {
        e.preventDefault();
        dispatch({ type: "OPERATOR", op: "×" });
      } else if (key === "/") {
        e.preventDefault();
        dispatch({ type: "OPERATOR", op: "÷" });
      } else if (key === "%") {
        e.preventDefault();
        dispatch({ type: "PERCENT" });
      } else if (key === "Enter" || key === "=") {
        e.preventDefault();
        dispatch({ type: "EQUALS" });
      } else if (key === "Backspace") {
        e.preventDefault();
        dispatch({ type: "BACKSPACE" });
      } else if (key === "Delete" || key === "c" || key === "C") {
        e.preventDefault();
        dispatch({ type: "CLEAR" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Format display number with Indian locale separators
  const formattedDisplay = (() => {
    const n = parseFloat(state.display);
    if (isNaN(n)) return state.display;
    const parts = state.display.split(".");
    const intPart = parseInt(parts[0], 10);
    const intFormatted = isNaN(intPart)
      ? parts[0]
      : intPart.toLocaleString("en-IN");
    return parts.length > 1 ? `${intFormatted}.${parts[1]}` : intFormatted;
  })();

  const expressionHint =
    state.prevValue !== null && state.operator
      ? `${parseFloat(state.prevValue.toFixed(8)).toLocaleString("en-IN")} ${state.operator}`
      : "";

  // Button definitions
  const buttons: Array<{
    label: React.ReactNode;
    action: () => void;
    variant?: "default" | "secondary" | "ghost" | "destructive" | "outline";
    className?: string;
    colSpan?: boolean;
    testId?: string;
  }> = [
    {
      label: "C",
      action: () => dispatch({ type: "CLEAR" }),
      variant: "outline",
      className: "text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 font-semibold",
      testId: "calc-clear",
    },
    {
      label: <Delete className="h-4 w-4" />,
      action: () => dispatch({ type: "BACKSPACE" }),
      variant: "outline",
      testId: "calc-backspace",
    },
    {
      label: "%",
      action: () => dispatch({ type: "PERCENT" }),
      variant: "outline",
      className: "text-orange-600 dark:text-orange-400",
      testId: "calc-percent",
    },
    {
      label: "÷",
      action: () => dispatch({ type: "OPERATOR", op: "÷" }),
      variant: "secondary",
      className: "text-primary font-bold text-lg",
      testId: "calc-div",
    },
    // Row 2
    { label: "7", action: () => dispatch({ type: "DIGIT", digit: "7" }), variant: "ghost", testId: "calc-7" },
    { label: "8", action: () => dispatch({ type: "DIGIT", digit: "8" }), variant: "ghost", testId: "calc-8" },
    { label: "9", action: () => dispatch({ type: "DIGIT", digit: "9" }), variant: "ghost", testId: "calc-9" },
    {
      label: "×",
      action: () => dispatch({ type: "OPERATOR", op: "×" }),
      variant: "secondary",
      className: "text-primary font-bold text-lg",
      testId: "calc-mul",
    },
    // Row 3
    { label: "4", action: () => dispatch({ type: "DIGIT", digit: "4" }), variant: "ghost", testId: "calc-4" },
    { label: "5", action: () => dispatch({ type: "DIGIT", digit: "5" }), variant: "ghost", testId: "calc-5" },
    { label: "6", action: () => dispatch({ type: "DIGIT", digit: "6" }), variant: "ghost", testId: "calc-6" },
    {
      label: "−",
      action: () => dispatch({ type: "OPERATOR", op: "−" }),
      variant: "secondary",
      className: "text-primary font-bold text-lg",
      testId: "calc-sub",
    },
    // Row 4
    { label: "1", action: () => dispatch({ type: "DIGIT", digit: "1" }), variant: "ghost", testId: "calc-1" },
    { label: "2", action: () => dispatch({ type: "DIGIT", digit: "2" }), variant: "ghost", testId: "calc-2" },
    { label: "3", action: () => dispatch({ type: "DIGIT", digit: "3" }), variant: "ghost", testId: "calc-3" },
    {
      label: "+",
      action: () => dispatch({ type: "OPERATOR", op: "+" }),
      variant: "secondary",
      className: "text-primary font-bold text-lg",
      testId: "calc-add",
    },
    // Row 5 — 0 spans 2 cols
    {
      label: "0",
      action: () => dispatch({ type: "DIGIT", digit: "0" }),
      variant: "ghost",
      colSpan: true,
      testId: "calc-0",
    },
    { label: ".", action: () => dispatch({ type: "DIGIT", digit: "." }), variant: "ghost", testId: "calc-dot" },
    {
      label: "=",
      action: () => dispatch({ type: "EQUALS" }),
      variant: "default",
      className: "bg-green-600 hover:bg-green-700 text-white font-bold text-lg",
      testId: "calc-equals",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-72 max-w-[92vw] p-4"
        // Prevent Radix from focusing first focusable element so keyboard works immediately
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="pb-0">
          <DialogTitle className="text-sm text-muted-foreground font-normal">
            Calculator
          </DialogTitle>
        </DialogHeader>

        {/* Display */}
        <div className="bg-muted rounded-lg px-3 py-2 mb-2 min-h-[4rem] flex flex-col items-end justify-end overflow-hidden">
          <span className="text-xs text-muted-foreground h-4 font-mono truncate w-full text-right">
            {expressionHint}
          </span>
          <span
            className="font-mono font-bold text-foreground truncate w-full text-right"
            style={{ fontSize: formattedDisplay.length > 12 ? "1.1rem" : formattedDisplay.length > 8 ? "1.4rem" : "1.75rem" }}
            data-testid="calc-display"
          >
            {formattedDisplay}
          </span>
        </div>

        {/* Button grid */}
        <div className="grid grid-cols-4 gap-1.5">
          {buttons.map((btn, i) => (
            <Button
              key={i}
              variant={btn.variant ?? "ghost"}
              size="sm"
              className={`h-11 text-base font-medium ${btn.colSpan ? "col-span-2" : ""} ${btn.className ?? ""}`}
              onClick={btn.action}
              data-testid={btn.testId}
              tabIndex={-1}   // keep keyboard focus off buttons so keydown goes to window
            >
              {btn.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
