import React, { useState } from "react";
import useMessages from "@/hooks/useMessages";

export default function Messages() {
  const { messages, loading, error, sendMessage } = useMessages();
  const [content, setContent] = useState("");

  const handleSend = async () => {
    if (!content.trim()) return;
    await sendMessage({ content });
    setContent("");
  };

  return (
    <div style={{ padding: 16 }}>
      <h1>Zprávy</h1>

      {loading && <div>Načítám…</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}

      <div style={{ marginBottom: 12 }}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Napište zprávu…"
          rows={3}
          style={{ width: "100%", padding: 8 }}
        />
        <button onClick={handleSend} style={{ marginTop: 8 }}>
          Odeslat
        </button>
      </div>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {messages.map((m) => (
          <li
            key={m.id}
            style={{
              padding: 8,
              borderBottom: "1px solid #eee",
              marginBottom: 6,
            }}
          >
            <div style={{ fontSize: 12, color: "#777" }}>
              {m.created_at ? new Date(m.created_at).toLocaleString() : ""}
            </div>
            <div>{m.content}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
