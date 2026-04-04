import { useState, useRef, useEffect } from "react";

type Role = "consumer" | "shop_owner" | "merchant" | "rider" | "admin";

interface Message {
  id: number;
  text: string;
  sender: "user" | "evo";
  intent?: string;
  timestamp: string;
}

const ROLES: { label: string; value: Role }[] = [
  { label: "Consumer", value: "consumer" },
  { label: "Shop Owner", value: "shop_owner" },
  { label: "Restaurant", value: "merchant" },
  { label: "Rider", value: "rider" },
  { label: "Admin", value: "admin" },
];

export default function DemoChat() {
  const [role, setRole] = useState<Role>("shop_owner");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  let nextId = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  function handleRoleChange(newRole: Role) {
    setRole(newRole);
    setMessages([]);
    setInput("");
  }

  async function send() {
    const text = input.trim();
    if (!text || thinking) return;

    const userMsg: Message = {
      id: nextId.current++,
      text,
      sender: "user",
      timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    try {
      const res = await fetch("/api/demo/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, phone: `demo-${role}`, message: text }),
      });
      const data = await res.json();
      const evoMsg: Message = {
        id: nextId.current++,
        text: data.reply || "(no response)",
        sender: "evo",
        intent: data.intent,
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, evoMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++,
          text: "Connection error. Is the server running?",
          sender: "evo",
          timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>Ooru DemoChat</div>
        <div style={styles.roleBar}>
          {ROLES.map((r) => (
            <button
              key={r.value}
              onClick={() => handleRoleChange(r.value)}
              style={{
                ...styles.roleBtn,
                ...(role === r.value ? styles.roleBtnActive : {}),
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={styles.messageArea}>
        {messages.length === 0 && (
          <div style={styles.empty}>
            Send a message as <b>{ROLES.find((r) => r.value === role)?.label}</b>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              ...styles.bubble,
              ...(m.sender === "user" ? styles.userBubble : styles.evoBubble),
            }}
          >
            <div style={styles.bubbleText}>{m.text}</div>
            <div style={styles.bubbleMeta}>
              {m.timestamp}
              {m.intent && <span style={styles.intent}> [{m.intent}]</span>}
            </div>
          </div>
        ))}
        {thinking && (
          <div style={{ ...styles.bubble, ...styles.evoBubble }}>
            <div style={styles.thinking}>Evo is thinking...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={styles.inputBar}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message..."
          disabled={thinking}
        />
        <button style={styles.sendBtn} onClick={send} disabled={thinking}>
          Send
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: "#0b141a",
    fontFamily: "system-ui, sans-serif",
    color: "#e9edef",
  },
  header: {
    background: "#1f2c34",
    padding: "12px 16px",
    borderBottom: "1px solid #2a3942",
  },
  headerTitle: {
    fontSize: "18px",
    fontWeight: 600,
    marginBottom: "8px",
  },
  roleBar: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap" as const,
  },
  roleBtn: {
    padding: "4px 12px",
    borderRadius: "16px",
    border: "1px solid #2a3942",
    background: "transparent",
    color: "#8696a0",
    cursor: "pointer",
    fontSize: "13px",
  },
  roleBtnActive: {
    background: "#00a884",
    color: "#fff",
    borderColor: "#00a884",
  },
  messageArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
  },
  empty: {
    textAlign: "center" as const,
    color: "#8696a0",
    marginTop: "40%",
    fontSize: "14px",
  },
  bubble: {
    maxWidth: "75%",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "14px",
    lineHeight: "1.4",
    wordBreak: "break-word" as const,
  },
  userBubble: {
    alignSelf: "flex-end",
    background: "#005c4b",
    borderTopRightRadius: "0",
  },
  evoBubble: {
    alignSelf: "flex-start",
    background: "#1f2c34",
    borderTopLeftRadius: "0",
  },
  bubbleText: {
    whiteSpace: "pre-wrap" as const,
  },
  bubbleMeta: {
    fontSize: "11px",
    color: "#8696a0",
    textAlign: "right" as const,
    marginTop: "4px",
  },
  intent: {
    color: "#00a884",
    fontFamily: "monospace",
  },
  thinking: {
    color: "#8696a0",
    fontStyle: "italic",
  },
  inputBar: {
    display: "flex",
    gap: "8px",
    padding: "12px 16px",
    background: "#1f2c34",
    borderTop: "1px solid #2a3942",
  },
  input: {
    flex: 1,
    padding: "10px 16px",
    borderRadius: "8px",
    border: "none",
    background: "#2a3942",
    color: "#e9edef",
    fontSize: "14px",
    outline: "none",
  },
  sendBtn: {
    padding: "10px 20px",
    borderRadius: "8px",
    border: "none",
    background: "#00a884",
    color: "#fff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 600,
  },
};
