import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const SupportForm: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!name.trim() || !email.trim() || !category || !message.trim()) {
      setSubmitStatus('error');
      setStatusMessage('Prosím vyplňte všechna pole.');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setSubmitStatus('error');
      setStatusMessage('Zadejte platnou e-mailovou adresu.');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const { data, error } = await supabase.functions.invoke('send-support-email', {
        body: {
          name: name.trim(),
          email: email.trim(),
          category,
          message: message.trim(),
        },
      });

      if (error) throw error;

      setSubmitStatus('success');
      setStatusMessage('Vaše zpráva byla úspěšně odeslána. Brzy se vám ozveme.');
      
      // Reset form
      setName('');
      setEmail('');
      setCategory('');
      setMessage('');
    } catch (error: any) {
      console.error('Error submitting support form:', error);
      setSubmitStatus('error');
      setStatusMessage(error?.message || 'Nepodařilo se odeslat zprávu. Zkuste to prosím později.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-12 pt-8 border-t border-border/20">
      <h2 className="text-xl md:text-2xl font-heading mb-6 bg-gradient-to-r from-[hsl(var(--heading-gold))] via-[hsl(45_85%_60%)] to-[hsl(var(--heading-gold))] bg-clip-text text-transparent">
        Formulář pro nahlášení problému
      </h2>
      
      {/* Status Messages */}
      {submitStatus === 'success' && (
        <div className="mb-6 p-4 rounded-lg border border-[hsl(45_80%_50%/0.3)] bg-[hsl(45_80%_50%/0.08)]">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-[hsl(45_85%_50%)] flex-shrink-0 mt-0.5" />
            <p className="text-[hsl(45_85%_70%)] text-sm leading-relaxed">
              {statusMessage}
            </p>
          </div>
        </div>
      )}
      
      {submitStatus === 'error' && (
        <div className="mb-6 p-4 rounded-lg border border-destructive/30 bg-destructive/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-destructive/90 text-sm leading-relaxed">
              {statusMessage}
            </p>
          </div>
        </div>
      )}

      <form className="space-y-6" onSubmit={handleSubmit}>
        {/* Name Field */}
        <div className="space-y-2">
          <Label htmlFor="support-name" className="text-foreground/80 text-sm">
            Jméno
          </Label>
          <Input
            id="support-name"
            type="text"
            placeholder="Vaše jméno"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 bg-muted/30 border-border/50 rounded-md focus:border-primary/50 focus:ring-primary/20 transition-colors"
            disabled={isSubmitting}
            maxLength={100}
          />
        </div>

        {/* Email Field */}
        <div className="space-y-2">
          <Label htmlFor="support-email" className="text-foreground/80 text-sm">
            E-mail
          </Label>
          <Input
            id="support-email"
            type="email"
            placeholder="vas@email.cz"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 bg-muted/30 border-border/50 rounded-md focus:border-primary/50 focus:ring-primary/20 transition-colors"
            disabled={isSubmitting}
            maxLength={255}
          />
        </div>

        {/* Category Select */}
        <div className="space-y-2">
          <Label htmlFor="support-category" className="text-foreground/80 text-sm">
            Kategorie
          </Label>
          <Select value={category} onValueChange={setCategory} disabled={isSubmitting}>
            <SelectTrigger className="h-11 bg-muted/30 border-border/50 rounded-md focus:border-primary/50 focus:ring-primary/20 transition-colors">
              <SelectValue placeholder="Vyberte kategorii" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="technical">Technický problém</SelectItem>
              <SelectItem value="payment">Platby a transakce</SelectItem>
              <SelectItem value="account">Účet a přihlášení</SelectItem>
              <SelectItem value="contest">Soutěže a výhry</SelectItem>
              <SelectItem value="other">Jiné</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Message Textarea */}
        <div className="space-y-2">
          <Label htmlFor="support-message" className="text-foreground/80 text-sm">
            Zpráva
          </Label>
          <Textarea
            id="support-message"
            placeholder="Popište váš problém..."
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="bg-muted/30 border-border/50 rounded-md focus:border-primary/50 focus:ring-primary/20 resize-none leading-relaxed transition-colors"
            disabled={isSubmitting}
            maxLength={2000}
          />
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="premium"
            className="h-11 px-8 rounded-md text-sm font-medium"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Odesílám...
              </>
            ) : (
              'Odeslat'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default SupportForm;
