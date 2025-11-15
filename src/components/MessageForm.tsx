import { useState } from "react";

export function MessageForm({ onSend }: { onSend: (content: string, title?: string) => Promise<boolean> }) {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!content.trim()) return;

    const ok = await onSend(content, title);
    if (ok) {
      setContent("");
      setTitle("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 border border-gray-700 rounded">
      <input
        className="w-full p-2 rounded bg-gray-800 border border-gray-600"
        placeholder="Titulek"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
        className="w-full p-2 rounded bg-gray-800 border border-gray-600"
        rows={3}
        placeholder="Napište zprávu…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      <button type="submit" className="w-full p-2 rounded bg-blue-600 hover:bg-blue-700">
        Odeslat
      </button>
    </form>
  );
}
