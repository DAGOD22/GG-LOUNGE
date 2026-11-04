import type { Metadata } from 'next';
import { ToolsWorkspace } from '@/components/tools/ToolsWorkspace';

export const metadata: Metadata = {
  title: 'Tools — GG-Lounge',
  description:
    'Eighteen free browser tools with GG-Lounge branding: calculator, notepad, stopwatch, countdown, world clock, unit converter, password generator, QR codes, JSON formatter, hash generator and more. Everything runs locally.',
};

export default function ToolsPage() {
  return <ToolsWorkspace />;
}
