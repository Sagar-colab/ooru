import { Route, Switch, Link } from "wouter";
import DemoChat from "./pages/DemoChat";
import KDS from "./pages/KDS";

export default function App() {
  return (
    <Switch>
      <Route path="/demo/chat" component={DemoChat} />
      <Route path="/kds/:merchantId" component={KDS} />
      <Route>
        <div style={{ fontFamily: "system-ui", padding: "2rem", textAlign: "center" }}>
          <h1>Ooru</h1>
          <p>Neighbourhood intelligence platform</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "24px" }}>
            <Link href="/demo/chat" style={{ color: "#00a884", fontSize: "18px" }}>
              DemoChat
            </Link>
            <Link href="/kds/1" style={{ color: "#3B82F6", fontSize: "18px" }}>
              KDS — Meghana Foods
            </Link>
          </div>
        </div>
      </Route>
    </Switch>
  );
}
