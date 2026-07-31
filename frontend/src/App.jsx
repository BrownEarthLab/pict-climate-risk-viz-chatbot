import { useEffect, useState } from "react";
import ChatPage from "./pages/ChatPage";
import { BivariateStory } from "./components/story/BivariateStory";

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function App() {
  const hash = useHashRoute();

  // The scrollytelling atlas is the root experience (splash first). The legacy
  // analysis workspace (spatial query, dynamic datasets, chatbot) remains
  // reachable at #workspace — its systems are untouched by this change.
  if (hash === "#workspace") {
    return <ChatPage />;
  }
  return <BivariateStory />;
}

export default App;
