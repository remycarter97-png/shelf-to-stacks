import { Home } from "./components/Home";
import { InstallPrompt, OfflineBanner } from "./components/InstallPrompt";
import { VotePage } from "./components/VotePage";
import { usePath } from "./lib/router";

export function App() {
  const path = usePath();
  const vote = path.match(/^\/vote\/([0-9a-f-]{36})\/?$/i);
  return (
    <>
      <OfflineBanner />
      {vote ? <VotePage pollId={vote[1]} /> : <Home />}
      <InstallPrompt />
    </>
  );
}
