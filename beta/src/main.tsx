import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { PublicEventPage } from "./components/PublicEventPage";

const eventCode = window.location.hash.match(/^#\/event\/([A-Z0-9]{8})/i)?.[1];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {eventCode ? <PublicEventPage publicCode={eventCode} /> : <App />}
  </StrictMode>
);
