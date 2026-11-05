import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { errorText, initBackend } from "./lib/api";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

initBackend()
  .then(() =>
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    ),
  )
  .catch((e) =>
    root.render(
      <div className="fatal">
        <h1>Spiel des Lebens konnte nicht starten</h1>
        <p>{errorText(e)}</p>
        <p className="dim">Im Browser wird WebAssembly benötigt (alle aktuellen Browser unterstützen es).</p>
      </div>,
    ),
  );
