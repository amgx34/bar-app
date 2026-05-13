'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Send, CheckCircle2, Calendar, Building2, User, Mail, Phone, Hash, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { demoRequestSchema, type DemoRequestInput } from '@/lib/schemas/demo';
import { submitDemoRequest } from '@/app/actions/contact';

const INQUIRY_TYPES = [
  { value: 'demo',    label: 'Schedule a Demo' },
  { value: 'pricing', label: 'Pricing Information' },
  { value: 'general', label: 'General Inquiry' },
  { value: 'other',   label: 'Other' },
];

export function DemoRequestForm() {
  const [submitted, setSubmitted] = useState(false);

  const {
    register, handleSubmit, setValue, watch,
    formState: { errors, isSubmitting },
  } = useForm<DemoRequestInput>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: { inquiry_type: 'demo', num_locations: 1 },
  });

  const inquiryType = watch('inquiry_type');

  async function onSubmit(values: DemoRequestInput) {
    try {
      await submitDemoRequest(values);
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-bold">We'll be in touch soon!</h3>
        <p className="text-muted-foreground max-w-sm">
          Thanks for reaching out. Our team typically responds within one business day.
          In the meantime, feel free to{' '}
          <a href="/api/demo" className="text-primary underline underline-offset-2">
            explore the demo
          </a>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Row 1: Name + Business */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground" /> Full Name *
          </Label>
          <Input {...register('name')} placeholder="Alex Johnson" />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Bar / Business Name *
          </Label>
          <Input {...register('business_name')} placeholder="The Tipsy Tavern" />
          {errors.business_name && <p className="text-xs text-destructive">{errors.business_name.message}</p>}
        </div>
      </div>

      {/* Row 2: Email + Phone */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" /> Email *
          </Label>
          <Input {...register('email')} type="email" placeholder="alex@tipsy-tavern.com" />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" /> Phone
          </Label>
          <Input {...register('phone')} type="tel" placeholder="+1 (555) 000-0000" />
        </div>
      </div>

      {/* Row 3: Locations + Inquiry type */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" /> Number of Locations
          </Label>
          <Input
            type="number" min={1} max={500}
            {...register('num_locations', { valueAsNumber: true })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" /> How can we help?
          </Label>
          <Select
            value={inquiryType}
            onValueChange={(v) => setValue('inquiry_type', (v ?? 'demo') as DemoRequestInput['inquiry_type'])}
          >
            <SelectTrigger>
              <span className="text-sm">
                {INQUIRY_TYPES.find(t => t.value === inquiryType)?.label ?? 'Schedule a Demo'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {INQUIRY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Preferred date */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> Preferred Demo Date (optional)
        </Label>
        <input
          type="date"
          {...register('preferred_date')}
          min={new Date().toISOString().split('T')[0]}
          className="w-full sm:w-48 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Message */}
      <div className="space-y-1.5">
        <Label>Message / Additional Details</Label>
        <Textarea
          {...register('message')}
          rows={4}
          placeholder="Tell us about your bar, current pain points, or anything specific you'd like to see in the demo…"
        />
      </div>

      <Button type="submit" disabled={isSubmitting} size="lg" className="w-full gap-2">
        {isSubmitting ? (
          <>Sending your request…</>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Request Demo
          </>
        )}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        No spam, ever. We'll only contact you about your request.
      </p>
    </form>
  );
}
