import { Home } from "./components/Home";
import { InstallHelp, InstallPrompt, OfflineBanner } from "./components/InstallPrompt";
import { VotePage } from "./components/VotePage";
import { ClubPage } from "./components/ClubPage";
import { BookPage } from "./components/BookPage";
import { usePath } from "./lib/router";

export function App() {
  const path = usePath();
  const vote = path.match(/^\/vote\/([0-9a-f-]{36})\/?$/i);
  const book = path.match(/^\/book\/(.+?)\/?$/);
  return (
    <>
      <OfflineBanner />
      {vote ? (
        <VotePage pollId={vote[1]} />
      ) : book ? (
        <BookPage id={safeDecode(book[1])} />
      ) : /^\/club\/?$/.test(path) ? (
        <ClubPage />
      ) : (
        <Home />
      )}
      {!vote && <InstallPrompt />}
      <InstallHelp />
    </>
  );
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
