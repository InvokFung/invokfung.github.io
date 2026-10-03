import { useEffect } from "react";
import { app } from "./state/app";
import { useStore } from "./state/store";
import { Header } from "./ui/Header";
import Landing from "./ui/Landing";
import TunerView from "./ui/TunerView";
import DrillView from "./ui/DrillView";
import ProgressView from "./ui/ProgressView";
import About from "./ui/About";

const TITLES = { home: "Intonation Studio", tuner: "Tuner · Intonation Studio", drill: "Drills · Intonation Studio", progress: "Progress · Intonation Studio" };

export default function App() {
  const view = useStore(app, (s) => s.view);
  useEffect(() => {
    document.title = TITLES[view];
  }, [view]);
  return (
    <>
      <button
        className="skip"
        onClick={() => {
          const main = document.getElementById("main");
          main?.setAttribute("tabindex", "-1");
          main?.focus();
        }}
      >
        Skip to content
      </button>
      <Header />
      {view === "home" && <Landing />}
      {view === "tuner" && <TunerView />}
      {view === "drill" && <DrillView />}
      {view === "progress" && <ProgressView />}
      <About />
    </>
  );
}
