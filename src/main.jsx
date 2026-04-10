import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CalorieTracker from "./calorie-tracker.jsx";

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <CalorieTracker />
    </StrictMode>
);