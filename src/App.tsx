import { Home } from "./components/Home";
import { InstallHelp, InstallPrompt, OfflineBanner } from "./components/InstallPrompt";
import { VotePage } from "./components/VotePage";
import { ClubPage } from "./components/ClubPage";
import { BookPage } from "./components/BookPage";
import { HubPage } from "./components/HubPage";
import { usePath } from "./lib/router";
import { JournalPage, PostPage } from "./components/JournalPages";
import { ContactPage } from "./components/ContactPage";
import { TabBar } from "./components/SiteChrome";

export function App() {
  const path = usePath();
  const vote = path.match(/^\/vote\/([0-9a-f-]{36})\/?$/i);
  const book = path.match(/^\/book\/(.+?)\/?$/);
  const hub = path.match(/^\/c\/([0-9a-f-]{36})\/?$/i);
  const post = path.match(/^\/journal\/([a-z0-9-]+)\/?$/);
  return (
    <>
      <OfflineBanner />
      {vote ? (
        <VotePage pollId={vote[1]} />
      ) : hub ? (
        <HubPage key={hub[1]} hubId={hub[1]} />
      ) : book ? (
        <BookPage id={safeDecode(book[1])} />
      ) : /^\/club\/?$/.test(path) ? (
        <ClubPage />
      ) : /^\/journal\/?$/.test(path) ? (
        <JournalPage />
      ) : post ? (
        <PostPage slug={post[1]} />
      ) : /^\/contact\/?$/.test(path) ? (
        <ContactPage />
      ) : (
        <Home />
      )}
      {!vote && <TabBar />}
      {!vote && !hub && <InstallPrompt />}
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
