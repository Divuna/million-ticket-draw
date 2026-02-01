import React, { useState } from 'react';
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
import { CheckCircle2, AlertCircle, Loader2, Mail, Phone, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const ContactForm: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation - category is optional
    if (!name.trim() || !email.trim() || !message.trim()) {
      setSubmitStatus('error');
      setStatusMessage('Prosím vyplňte jméno, e-mail a zprávu.');
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
          category: category || 'general',
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
      console.error('Error submitting contact form:', error);
      setSubmitStatus('error');
      setStatusMessage(error?.message || 'Nepodařilo se odeslat zprávu. Zkuste to prosím později.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Intro Text */}
      <div className="space-y-4">
        <p className="text-muted-foreground leading-[1.85] text-[15px] md:text-base">
          Máte dotaz, připomínku nebo potřebujete pomoc? Napište nám pomocí formuláře níže a my se vám co nejdříve ozveme.
        </p>
      </div>

      {/* Direct Contact Info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 p-5 bg-muted/30 rounded-xl border border-border/20 transition-colors hover:bg-muted/40">
          <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5 text-[hsl(var(--heading-gold))]" />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-medium">E-mail</p>
            <a 
              href="mailto:podpora@onemil.cz" 
              className="text-[hsl(var(--heading-gold))] font-medium hover:underline text-[15px] md:text-base"
            >
              podpora@onemil.cz
            </a>
          </div>
        </div>

        <div className="flex items-center gap-4 p-5 bg-muted/30 rounded-xl border border-border/20 transition-colors hover:bg-muted/40">
          <div className="w-10 h-10 bg-[hsl(var(--heading-gold))]/10 rounded-full flex items-center justify-center flex-shrink-0">
            <Phone className="w-5 h-5 text-[hsl(var(--heading-gold))]" />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-medium">Telefon</p>
            <a 
              href="tel:+420776532562" 
              className="text-[hsl(var(--heading-gold))] font-medium hover:underline text-[15px] md:text-base"
            >
              +420 776 532 562
            </a>
          </div>
        </div>
      </div>

      {/* Contact Form */}
      <div className="pt-6 border-t border-border/20">
        <h2 className="text-xl md:text-2xl font-heading mb-6 bg-gradient-to-r from-[hsl(var(--heading-gold))] via-[hsl(45_85%_60%)] to-[hsl(var(--heading-gold))] bg-clip-text text-transparent">
          Napište nám
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
            <Label htmlFor="contact-name" className="text-foreground/80 text-sm">
              Jméno <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contact-name"
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
            <Label htmlFor="contact-email" className="text-foreground/80 text-sm">
              E-mail <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contact-email"
              type="email"
              placeholder="vas@email.cz"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 bg-muted/30 border-border/50 rounded-md focus:border-primary/50 focus:ring-primary/20 transition-colors"
              disabled={isSubmitting}
              maxLength={255}
            />
          </div>

          {/* Category Select - Optional */}
          <div className="space-y-2">
            <Label htmlFor="contact-category" className="text-foreground/80 text-sm">
              Kategorie <span className="text-muted-foreground/60 text-xs">(nepovinné)</span>
            </Label>
            <Select value={category} onValueChange={setCategory} disabled={isSubmitting}>
              <SelectTrigger className="h-11 bg-muted/30 border-border/50 rounded-md focus:border-primary/50 focus:ring-primary/20 transition-colors">
                <SelectValue placeholder="Vyberte kategorii" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">Obecný dotaz</SelectItem>
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
            <Label htmlFor="contact-message" className="text-foreground/80 text-sm">
              Zpráva <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="contact-message"
              placeholder="Vaše zpráva..."
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
                'Odeslat zprávu'
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Response Time Note */}
      <div className="flex items-start gap-3 p-4 bg-muted/20 rounded-xl border border-border/20">
        <Clock className="w-5 h-5 text-[hsl(var(--heading-gold))]/70 flex-shrink-0 mt-0.5" />
        <p className="text-muted-foreground/80 text-sm leading-relaxed">
          Na většinu dotazů odpovídáme do 24 hodin v pracovní dny.
        </p>
      </div>
    </div>
  );
};

export default ContactForm;
