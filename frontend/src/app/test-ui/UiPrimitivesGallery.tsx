'use client';

import { useState } from 'react';
import { Bell, Home, LogOut, Settings, UserCircle, Wrench } from 'lucide-react';
import {
  Button,
  IconButton,
  Menu,
  MenuItem,
  MenuLabel,
  MenuPanel,
  MenuSection,
  MenuTrigger,
  Overlay,
  Panel,
} from '@/components/ui';

/**
 * plan_ui_foundation T2: every primitive in every variant, on one fixture page, so
 * `visual.spec.ts` can snapshot it (`ui-primitives.png`) and the mobile audit can measure
 * it. Also the fastest way to eyeball a theme: flip `data-theme` on <html> in devtools.
 */
export function UiPrimitivesGallery() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<'court' | 'night'>('court');

  function flipTheme() {
    const next = theme === 'court' ? 'night' : 'court';
    document.documentElement.setAttribute('data-theme', next);
    setTheme(next);
  }

  return (
    <div className="flex flex-col gap-6 text-ink">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-black uppercase tracking-widest text-ink-subtle">Button</span>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button size="lg">Take Nikola Jokić</Button>
        <Button disabled>Select a card</Button>
        <Button href="/" icon={<Home className="size-4" />}>Link as button</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-black uppercase tracking-widest text-ink-subtle">IconButton</span>
        <IconButton label="Settings"><Settings className="size-5" /></IconButton>
        <IconButton label="Notifications" variant="raised"><Bell className="size-5" /></IconButton>
        <IconButton label="Home" href="/" variant="raised"><Home className="size-5" /></IconButton>
        <Panel variant="inverse" padding="sm" className="flex items-center gap-2">
          <Button variant="inverse">Inverse</Button>
          <IconButton label="Settings (inverse)" variant="inverse"><Settings className="size-5" /></IconButton>
        </Panel>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Panel>
          <p className="font-bold">Panel raised</p>
          <p className="text-sm text-ink-muted">Default surface for cards and sheets.</p>
        </Panel>
        <Panel variant="sunken">
          <p className="font-bold">Panel sunken</p>
          <p className="text-sm text-ink-muted">Wells, table stripes.</p>
        </Panel>
        <Panel variant="inverse">
          <p className="font-bold">Panel inverse</p>
          <p className="text-sm text-ink-inverse-muted">Game shell, toasts.</p>
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <span className="text-xs font-black uppercase tracking-widest text-ink-subtle">Menu</span>
        <Menu>
          <MenuTrigger label="Profile menu">
            <UserCircle className="size-7" />
            <span className="text-xs font-bold uppercase tracking-wider">E2E Test</span>
          </MenuTrigger>
          <MenuPanel>
            <MenuSection>
              <p className="px-3 py-2 font-bold">E2E Test</p>
            </MenuSection>
            <MenuSection>
              <MenuLabel>Admin tools</MenuLabel>
              <MenuItem href="/data" icon={<Wrench className="size-4" />}>Data viewer</MenuItem>
            </MenuSection>
            <MenuItem tone="danger" icon={<LogOut className="size-4" />}>Sign out</MenuItem>
          </MenuPanel>
        </Menu>

        <span className="text-xs font-black uppercase tracking-widest text-ink-subtle">Overlay</span>
        <Button variant="secondary" onClick={() => setOpen(true)}>Open overlay</Button>
        <Overlay open={open} onClose={() => setOpen(false)} labelledBy="gallery-overlay-title">
          <div className="p-6">
            <h2 id="gallery-overlay-title" className="font-display text-3xl italic">Fresh off the bench</h2>
            <p className="mt-1 text-sm text-ink-inverse-muted">
              Long content scrolls inside the panel; it never grows past 90dvh.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {Array.from({ length: 12 }, (_, i) => (
                <Panel key={i} variant="sunken" padding="sm" className="text-sm text-ink">Row {i + 1}</Panel>
              ))}
            </div>
            <Button size="lg" className="mt-4 w-full" onClick={() => setOpen(false)}>Back to the court</Button>
          </div>
        </Overlay>

        <Button variant="ghost" onClick={flipTheme} data-testid="theme-flip">Theme: {theme}</Button>
      </div>
    </div>
  );
}
