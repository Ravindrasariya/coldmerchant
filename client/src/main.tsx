import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

document.addEventListener("wheel", (e) => {
  const target = e.target as HTMLElement;
  if (target && target.tagName === "INPUT" && (target as HTMLInputElement).type === "number") {
    e.preventDefault();
    (target as HTMLInputElement).blur();
  }
}, { passive: false });

document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (target && target.tagName === "INPUT" && (target as HTMLInputElement).type === "number") {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  }
});

createRoot(document.getElementById("root")!).render(<App />);
