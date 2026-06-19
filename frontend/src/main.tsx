import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PlayView } from "./components/PlayView";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlayView />
  </StrictMode>,
);
