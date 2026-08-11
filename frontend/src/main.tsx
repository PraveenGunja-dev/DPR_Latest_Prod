import { createRoot } from "react-dom/client"
import App from "./App.tsx"
import "./index.css"

// Prevent arrow keys from altering number inputs globally
document.addEventListener('keydown', (e) => {
  if (
    e.target instanceof HTMLInputElement &&
    e.target.type === 'number' &&
    (e.key === 'ArrowUp' || e.key === 'ArrowDown')
  ) {
    e.preventDefault();
  }
});

// Prevent trackpad/mouse scroll from altering number inputs globally
document.addEventListener('wheel', (e) => {
  if (
    e.target instanceof HTMLInputElement &&
    e.target.type === 'number'
  ) {
    // If the input is focused, scrolling changes the value. Prevent it.
    e.preventDefault();
  }
}, { passive: false });

createRoot(document.getElementById("root")!).render(<App />)