import React, { useState } from "react";
import useAdminMessages from "@/hooks/useAdminMessages";

export default function AdminMessages() {
  const { messages, loading, error, deleteMessage, updateMessage } = useAdminMessages();

  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);

  const startEdit = (m: any) => setEditing({ id: m.id, content: m.content });
  const cancelEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    await updateMessage(editing.id, editing.content);
    setEditing(null);
  };

  return (
    <div style={{ padding: 16 }}>
      <h1>Admin zprávy</h1>

      {loading && <div>Načítám…</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {messages.map((m) => (
          <li
            key={m.id}
            style={{
              padding: 8,
              borderBottom: "1px solid #eee",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "#777" }}>
                {m.created_at ? new Date(m.created_at).toLocaleString() : ""}
              </div>
              <div>{m.content}</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>Uživatel: {m.user_id ?? "unknown"}</div>
            </div>

            <div>
              <button onClick={() => startEdit(m)} style={{ marginRight: 8 }}>
                Upravit
              </button>
              <button onClick={() => deleteMessage(m.id)} style={{ color: "red" }}>
                Smazat
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            background: "white",
            padding: 16,
            border: "1px solid #ddd",
          }}
        >
          <h3>Upravit zprávu</h3>
          <textarea
            value={editing.content}
            onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            style={{ width: 300, height: 100 }}
          />

          <div style={{ marginTop: 8 }}>
            <button onClick={saveEdit} style={{ marginRight: 8 }}>
              Uložit
            </button>
            <button onClick={cancelEdit}>Zrušit</button>
          </div>
        </div>
      )}
    </div>
  );
}
