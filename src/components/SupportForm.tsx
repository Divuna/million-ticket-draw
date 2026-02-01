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
    <Card className="mt-12 border-border/30 bg-gradient-to-b from-card/60 to-card/40 backdrop-blur-sm shadow-[0_8px_32px_hsl(222_50%_3%/0.4)]">
      <CardHeader className="pb-6">
        <CardTitle className="text-xl md:text-2xl font-heading bg-gradient-to-r from-[hsl(var(--heading-gold))] via-[hsl(45_85%_60%)] to-[hsl(var(--heading-gold))] bg-clip-text text-transparent">
          Formulář pro nahlášení problému
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Status Messages */}
        {submitStatus === 'success' && (
          <Alert className="mb-6 border-primary/50 bg-primary/10">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <AlertDescription className="text-primary">
              {statusMessage}
            </AlertDescription>
          </Alert>
        )}
        
        {submitStatus === 'error' && (
          <Alert className="mb-6 border-destructive/50 bg-destructive/10">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-destructive">
              {statusMessage}
            </AlertDescription>
          </Alert>
        )}

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* Name Field */}
          <div className="space-y-2">
            <Label htmlFor="support-name" className="text-foreground/90">
              Jméno
            </Label>
            <Input
              id="support-name"
              type="text"
              placeholder="Vaše jméno"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-background/50 border-border/40 focus:border-primary/50"
              disabled={isSubmitting}
              maxLength={100}
            />
          </div>

          {/* Email Field */}
          <div className="space-y-2">
            <Label htmlFor="support-email" className="text-foreground/90">
              E-mail
            </Label>
            <Input
              id="support-email"
              type="email"
              placeholder="vas@email.cz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-background/50 border-border/40 focus:border-primary/50"
              disabled={isSubmitting}
              maxLength={255}
            />
          </div>

          {/* Category Select */}
          <div className="space-y-2">
            <Label htmlFor="support-category" className="text-foreground/90">
              Kategorie
            </Label>
            <Select value={category} onValueChange={setCategory} disabled={isSubmitting}>
              <SelectTrigger className="bg-background/50 border-border/40 focus:border-primary/50">
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
            <Label htmlFor="support-message" className="text-foreground/90">
              Zpráva
            </Label>
            <Textarea
              id="support-message"
              placeholder="Popište váš problém..."
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="bg-background/50 border-border/40 focus:border-primary/50 resize-none"
              disabled={isSubmitting}
              maxLength={2000}
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            variant="premium"
            className="w-full md:w-auto px-8"
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
        </form>
      </CardContent>
    </Card>
  );
};

export default SupportForm;
