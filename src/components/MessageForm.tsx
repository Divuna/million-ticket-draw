import { useState } from "react";

type MessageFormProps = {
  onSubmit: (content: string, title?: string) => Promise<boolean>;
  placeholder?: string;
  showTitle?: boolean;
};

export function MessageForm({ onSubmit, placeholder = "Napište zprávu…", showTitle = true }: MessageFormProps) {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!content.trim()) return;

    const ok = await onSubmit(content, title);
    if (ok) {
      setContent("");
      setTitle("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {showTitle && (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nadpis zprávy"
          className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
        />
      )}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
      />

      <button type="submit" className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 transition text-white">
        Odeslat
      </button>
    </form>
  );
}
