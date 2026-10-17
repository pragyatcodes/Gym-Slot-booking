import * as React from 'react';
import { Settings, Plus, Edit2, ChevronLeft, ChevronRight, ArrowUpRight, X, Check } from 'lucide-react';
import { format, addMonths, subMonths, addDays, startOfWeek, startOfMonth, getDaysInMonth, isSameDay } from 'date-fns';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import MetallicButton from '@/components/ui/button-metallic';

export interface GlassCalendarProps extends React.HTMLAttributes<HTMLDivElement> {
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  /** Gym-local date supplied by the server, rather than the browser's timezone. */
  today?: Date;
  sessionCounts?: Record<string, number>;
  onNewEvent?: () => void;
  onViewSessions?: () => void;
  /** Account-specific local-storage prefix. Notes stay on this browser only. */
  notesKey?: string;
}

const keyOf = (date: Date) => format(date, 'yyyy-MM-dd');
const memory = new Map<string, string>();
function readLocal(key: string) {
  try { return localStorage.getItem(key) || ''; } catch { return memory.get(key) || ''; }
}
function writeLocal(key: string, value: string) {
  memory.set(key, value);
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); return true; }
  catch { return false; }
}

export const GlassCalendar = React.forwardRef<HTMLDivElement, GlassCalendarProps>(
  ({ className, selectedDate: controlledDate, onDateSelect, today = new Date(), sessionCounts = {}, onNewEvent, onViewSessions, notesKey = 'form-calendar', ...props }, ref) => {
    const [internalDate, setInternalDate] = React.useState(controlledDate || today);
    const selectedDate = controlledDate || internalDate;
    const [currentMonth, setCurrentMonth] = React.useState(selectedDate);
    const [view, setView] = React.useState<'weekly' | 'monthly'>(() => readLocal(`${notesKey}:view`) === 'monthly' ? 'monthly' : 'weekly');
    const [weekStartsOn, setWeekStartsOn] = React.useState<0 | 1>(() => readLocal(`${notesKey}:week-start`) === '0' ? 0 : 1);
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    const [noteOpen, setNoteOpen] = React.useState(false);
    const [note, setNote] = React.useState('');
    const [savedNote, setSavedNote] = React.useState('');
    const [message, setMessage] = React.useState('');
    const reduceMotion = useReducedMotion();
    const calendarId = React.useId();
    const settingsRef = React.useRef<HTMLDivElement>(null);
    const gridRef = React.useRef<HTMLDivElement>(null);
    const settingsButton = React.useRef<HTMLButtonElement>(null);
    const noteButton = React.useRef<HTMLButtonElement>(null);
    const noteRef = React.useRef<HTMLTextAreaElement>(null);
    const dateKey = keyOf(selectedDate);
    const noteKey = `${notesKey}:note:${dateKey}`;

    React.useEffect(() => { setCurrentMonth(selectedDate); }, [dateKey]);
    React.useEffect(() => {
      const stored = readLocal(noteKey);
      setSavedNote(stored); setNote(stored); setMessage(''); setNoteOpen(false);
    }, [noteKey]);
    React.useEffect(() => { if (noteOpen) noteRef.current?.focus(); }, [noteOpen]);
    React.useEffect(() => {
      if (!settingsOpen) return;
      const closeOutside = (event: PointerEvent) => {
        if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false);
      };
      document.addEventListener('pointerdown', closeOutside);
      return () => document.removeEventListener('pointerdown', closeOutside);
    }, [settingsOpen]);

    const start = view === 'weekly' ? startOfWeek(currentMonth, { weekStartsOn }) : startOfMonth(currentMonth);
    const count = view === 'weekly' ? 7 : getDaysInMonth(currentMonth);
    const days = Array.from({ length: count }, (_, i) => addDays(start, i));
    const blankDays = view === 'monthly' ? (start.getDay() - weekStartsOn + 7) % 7 : 0;
    const dayLabels = Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(today, { weekStartsOn }), i), 'EEE'));
    const selectedCount = sessionCounts[dateKey] || 0;
    const selectedVisible = days.some(day => isSameDay(day, selectedDate));
    const header = view === 'weekly' && format(start, 'MMMM') !== format(addDays(start, 6), 'MMMM')
      ? `${format(start, 'MMM')} / ${format(addDays(start, 6), 'MMM')}` : format(currentMonth, 'MMMM');

    const selectDate = (date: Date) => {
      setInternalDate(date); setCurrentMonth(date); onDateSelect?.(date);
    };
    const movePeriod = (direction: -1 | 1) => {
      setCurrentMonth(view === 'weekly' ? addDays(currentMonth, direction * 7) : direction > 0 ? addMonths(currentMonth, 1) : subMonths(currentMonth, 1));
    };
    const switchView = (next: 'weekly' | 'monthly') => {
      setView(next); writeLocal(`${notesKey}:view`, next);
    };
    const keyboardDate = (event: React.KeyboardEvent<HTMLButtonElement>, date: Date) => {
      const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -(date.getDay() - weekStartsOn + 7) % 7, End: 6 - (date.getDay() - weekStartsOn + 7) % 7 };
      if (!(event.key in offsets)) return;
      event.preventDefault();
      const next = addDays(date, offsets[event.key]); selectDate(next);
      requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-calendar-date="${keyOf(next)}"]`)?.focus());
    };
    const saveNote = () => {
      const value = note.trim(); const persisted = writeLocal(noteKey, value);
      setSavedNote(value); setNoteOpen(false);
      setMessage(persisted ? value ? 'Note saved on this browser.' : 'Note removed.' : 'Browser storage is blocked. Note kept until this page is closed.');
      noteButton.current?.focus();
    };

    return (
      <div ref={ref} className={cn('glass-calendar w-full rounded-2xl p-4 shadow-2xl overflow-hidden text-white', className)} {...props}>
        <div className="flex items-center justify-between gap-3">
          <div className="calendar-tabs inline-flex gap-1 rounded-xl p-1" role="group" aria-label="Calendar view">
            {(['weekly', 'monthly'] as const).map(option => (
              <button key={option} type="button" aria-pressed={view === option} onClick={() => switchView(option)} className={cn('rounded-lg px-4 py-2 text-sm font-semibold transition-colors', view === option ? 'bg-white text-slate-950' : 'text-slate-200 hover:bg-white/10')}>
                {option === 'weekly' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>
          <div ref={settingsRef} className="calendar-settings relative">
            <button type="button" ref={settingsButton} aria-label="Calendar settings" aria-expanded={settingsOpen} aria-controls={`${calendarId}-settings`} onClick={() => setSettingsOpen(!settingsOpen)} className="calendar-icon-button rounded-full p-2 text-slate-200 hover:bg-white/10"><Settings size={20}/></button>
            {settingsOpen && <div id={`${calendarId}-settings`} className="settings-popover" onKeyDown={event => { if (event.key === 'Escape') { setSettingsOpen(false); settingsButton.current?.focus(); } }}>
              <label htmlFor={`${calendarId}-week`}>Start the week on</label>
              <select id={`${calendarId}-week`} value={weekStartsOn} onChange={event => { const value = Number(event.target.value) as 0 | 1; setWeekStartsOn(value); writeLocal(`${notesKey}:week-start`, String(value)); }}>
                <option value={1}>Monday</option><option value={0}>Sunday</option>
              </select>
              <p>Session times use IST.</p>
            </div>}
          </div>
        </div>

        <div className="calendar-month-heading my-3 flex items-center justify-between gap-3">
          <div>
            <div className="calendar-kicker">YOUR MOVEMENT CALENDAR</div>
            <motion.h3 key={`${header}-${format(currentMonth, 'yyyy')}`} initial={reduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }} className="text-2xl font-bold tracking-tight">
              {header} <span className="calendar-year">{format(currentMonth, 'yyyy')}</span>
            </motion.h3>
          </div>
          <div className="calendar-navigation flex items-center gap-2">
            <button type="button" onClick={() => selectDate(today)} className="calendar-today rounded-lg px-3 py-2 text-sm font-semibold">Today</button>
            <button type="button" aria-label={`Previous ${view === 'weekly' ? 'week' : 'month'}`} onClick={() => movePeriod(-1)} className="calendar-icon-button rounded-full p-2 hover:bg-white/10"><ChevronLeft size={20}/></button>
            <button type="button" aria-label={`Next ${view === 'weekly' ? 'week' : 'month'}`} onClick={() => movePeriod(1)} className="calendar-icon-button rounded-full p-2 hover:bg-white/10"><ChevronRight size={20}/></button>
          </div>
        </div>

        <div className="calendar-week-range">{view === 'weekly' ? `${format(start, 'd MMM')} – ${format(addDays(start, 6), 'd MMM yyyy')}` : 'Select a date to see available sessions.'}</div>
        <div className={cn('calendar-grid', view === 'monthly' && 'calendar-grid-monthly')} ref={gridRef} role="group" aria-label={view === 'weekly' ? 'Choose a date this week' : `Choose a date in ${format(currentMonth, 'MMMM yyyy')}`}>
          {dayLabels.map(label => <div key={label} className="calendar-weekday" aria-hidden="true">{label}</div>)}
          {Array.from({ length: blankDays }, (_, i) => <div key={`empty-${i}`} aria-hidden="true"/>)}
          {days.map((date, index) => {
            const selected = isSameDay(date, selectedDate); const current = isSameDay(date, today); const n = sessionCounts[keyOf(date)] || 0;
            return <button key={keyOf(date)} type="button" data-calendar-date={keyOf(date)} aria-label={`${format(date, 'EEEE, d MMMM yyyy')}, ${n} ${n === 1 ? 'session' : 'sessions'}`} aria-pressed={selected} aria-current={current ? 'date' : undefined} tabIndex={selected || (!selectedVisible && index === 0) ? 0 : -1} onClick={() => selectDate(date)} onKeyDown={event => keyboardDate(event, date)} className={cn('calendar-date relative flex flex-col items-center justify-center rounded-2xl font-semibold transition-colors', selected ? 'calendar-date-selected text-white' : 'text-slate-100 hover:bg-white/10', current && !selected && 'calendar-date-today')}>
              <span>{format(date, 'd')}</span>
              {view === 'weekly' ? <span className="calendar-date-count">{n ? `${n} ${n === 1 ? 'session' : 'sessions'}` : 'No sessions'}</span> : <span className={cn('calendar-session-dot', n > 0 && 'has-sessions')} aria-hidden="true"/>}
            </button>;
          })}
        </div>

        <div className="calendar-selection mt-5 flex flex-wrap items-center justify-between gap-2" aria-live="polite">
          <span>{format(selectedDate, 'EEEE, d MMMM')} <span className="calendar-count">· {selectedCount} {selectedCount === 1 ? 'session' : 'sessions'}</span></span>
          <span className="calendar-legend"><i/> Today <span className="legend-divider">/</span> All times IST</span>
        </div>
        <div className="mt-5 h-px bg-white/20"/>
        <div className="calendar-footer mt-4 flex items-center justify-between gap-3">
          <button type="button" ref={noteButton} aria-expanded={noteOpen} aria-controls={`${calendarId}-note`} onClick={() => { setNote(savedNote); setNoteOpen(!noteOpen); setMessage(''); }} className="flex items-center gap-2 rounded-lg py-2 text-sm font-medium text-slate-200 hover:text-white"><Edit2 size={17}/><span>{savedNote ? 'Edit your note' : 'Add a note…'}</span></button>
          {(onNewEvent || onViewSessions) && (
            <MetallicButton type="button" onClick={onNewEvent || onViewSessions} className="min-w-[9.5rem]">
              {onNewEvent ? 'New session' : 'View sessions'}
              {onNewEvent ? <Plus className="size-4" /> : <ArrowUpRight className="size-4" />}
            </MetallicButton>
          )}
        </div>
        {noteOpen && <div id={`${calendarId}-note`} className="calendar-note mt-4">
          <label htmlFor={`${calendarId}-note-input`}>Your note for {format(selectedDate, 'd MMMM')}</label>
          <textarea ref={noteRef} id={`${calendarId}-note-input`} value={note} maxLength={500} onChange={event => setNote(event.target.value)} placeholder="A reminder for your next session…" rows={3}/>
          <p>Private to this account on this browser. Not sent to the studio.</p>
          <div className="flex flex-wrap gap-3 mt-3">
            <MetallicButton type="button" size="sm" onClick={saveNote}>
              Save note
              <Check className="size-4" />
            </MetallicButton>
            <button type="button" className="flex gap-2 items-center rounded-lg px-3 py-2 text-slate-200" onClick={() => { setNoteOpen(false); noteButton.current?.focus(); }}><X size={16}/>Cancel</button>
          </div>
        </div>}
        {!noteOpen && savedNote && <p className="calendar-saved-note">{savedNote}</p>}
        {message && <p className="calendar-message" role="status">{message}</p>}
      </div>
    );
  },
);
GlassCalendar.displayName = 'GlassCalendar';
