import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Send } from 'lucide-react';

interface MessageFormProps {
  onSubmit: (content: string, title?: string) => Promise<boolean>;
  placeholder?: string;
  showTitle?: boolean;
}

export const MessageForm: React.FC<MessageFormProps> = ({ 
  onSubmit, 
  placeholder = 'Napište zprávu...',
  showTitle = true
}) => {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim()) return;

    setSending(true);
    const success = await onSubmit(content, showTitle && title ? title : undefined);
    
    if (success) {
      setContent('');
      setTitle('');
    }
    
    setSending(false);
  };

  return (
    <Card className="ticket-message ticket-perforations">
      <CardHeader>
        <CardTitle className="text-neon-orange">Nová zpráva</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {showTitle && (
            <div className="space-y-2">
              <Label htmlFor="title">Předmět (volitelné)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Předmět zprávy"
                disabled={sending}
              />
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="content">Zpráva</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={placeholder}
              disabled={sending}
              rows={4}
              className="resize-none"
              required
            />
          </div>

          <Button 
            type="submit" 
            disabled={sending || !content.trim()}
            className="w-full"
          >
            <Send className="mr-2 h-4 w-4" />
            {sending ? 'Odesílám...' : 'Odeslat'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
