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

const SupportForm: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');

  return (
    <Card className="mt-12 border-border/30 bg-gradient-to-b from-card/60 to-card/40 backdrop-blur-sm shadow-[0_8px_32px_hsl(222_50%_3%/0.4)]">
      <CardHeader className="pb-6">
        <CardTitle className="text-xl md:text-2xl font-heading bg-gradient-to-r from-[hsl(var(--heading-gold))] via-[hsl(45_85%_60%)] to-[hsl(var(--heading-gold))] bg-clip-text text-transparent">
          Formulář pro nahlášení problému
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
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
            />
          </div>

          {/* Category Select */}
          <div className="space-y-2">
            <Label htmlFor="support-category" className="text-foreground/90">
              Kategorie
            </Label>
            <Select value={category} onValueChange={setCategory}>
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
            />
          </div>

          {/* Submit Button - No action */}
          <Button
            type="button"
            variant="premium"
            className="w-full md:w-auto px-8"
          >
            Odeslat
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default SupportForm;
