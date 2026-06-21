import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Pas de StrictMode : en dev il monte les effets deux fois, ce qui doublerait
// nos abonnements aux events Tauri (et donc les messages reçus).
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
