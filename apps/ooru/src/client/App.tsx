import { Route, Switch, Link } from "wouter";
import DemoChat from "./pages/DemoChat";

export default function App() {
  return (
    <Switch>
      <Route path="/demo/chat" component={DemoChat} />
      <Route>
        <div style={{ fontFamily: "system-ui", padding: "2rem", textAlign: "center" }}>
          <h1>Ooru</h1>
          <p>Neighbourhood intelligence platform</p>
          <Link href="/demo/chat" style={{ color: "#00a884", fontSize: "18px" }}>
            Open DemoChat
          </Link>
        </div>
      </Route>
    </Switch>
  );
}
