import { Route, Switch, Link, Redirect } from "wouter";
import DemoChat from "./pages/DemoChat";
import KDS from "./pages/KDS";
import POS from "./pages/POS";
import Neighbourhood from "./pages/Neighbourhood";
import Market from "./pages/Market";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <Switch>
      <Route path="/demo/chat" component={DemoChat} />
      <Route path="/kds/:merchantId" component={KDS} />
      <Route path="/pos/:merchantId" component={POS} />
      <Route path="/neighbourhood/:slug" component={Neighbourhood} />
      <Route path="/market/:slug" component={Market} />
      <Route path="/admin" component={Admin} />
      <Route path="/">
        <Redirect to="/demo/chat" />
      </Route>
      <Route>
        <div style={{ fontFamily: "system-ui", padding: "2rem", textAlign: "center" }}>
          <h1>Ooru</h1>
          <p>Neighbourhood intelligence platform</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "24px" }}>
            <Link href="/neighbourhood/indiranagar" style={{ color: "#8B5CF6", fontSize: "18px" }}>
              Neighbourhood Map
            </Link>
            <Link href="/demo/chat" style={{ color: "#00a884", fontSize: "18px" }}>
              DemoChat
            </Link>
            <Link href="/kds/1" style={{ color: "#3B82F6", fontSize: "18px" }}>
              KDS — Meghana Foods
            </Link>
            <Link href="/pos/1" style={{ color: "#8B5CF6", fontSize: "18px" }}>
              POS — Meghana Foods
            </Link>
          </div>
        </div>
      </Route>
    </Switch>
  );
}
