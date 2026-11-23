'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

interface AppleDatePickerProps {
  selectedDate: string;
  todayDate: string;
  yesterdayDate: string;
  availableDates: Set<string>;
  countsByDate: Record<string, number>;
  visitorTimeZone: string;
  onSelectDate: (dateStr: string) => void;
  onOpen?: () => void;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }
  return { year: y, month: m, day: d };
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatShortDateLabel(dateStr: string): string {
  const { month, day } = parseDateParts(dateStr);
  return `${month}月${day}日`;
}

export function AppleDatePicker({
  selectedDate,
  todayDate,
  yesterdayDate,
  availableDates,
  countsByDate,
  visitorTimeZone,
  onSelectDate,
  onOpen,
}: AppleDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const todayParts = useMemo(() => parseDateParts(todayDate), [todayDate]);
  const selectedParts = useMemo(() => parseDateParts(selectedDate), [selectedDate]);

  const [viewYear, setViewYear] = useState(selectedParts.year);
  const [viewMonth, setViewMonth] = useState(selectedParts.month);
  const [desktopAnchor, setDesktopAnchor] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isCustomDate = selectedDate !== todayDate && selectedDate !== yesterdayDate;

  const updateAnchorPosition = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 640) {
      setDesktopAnchor(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const top = Math.min(rect.bottom + 8, window.innerHeight - 380);
    const right = Math.max(12, window.innerWidth - rect.right);
    setDesktopAnchor({ top: Math.max(12, top), right });
  }, []);

  const handleToggleOpen = () => {
    if (!open) {
      setViewYear(selectedParts.year);
      setViewMonth(selectedParts.month);
      updateAnchorPosition();
      onOpen?.();
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const handleClose = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => {
      triggerRef.current?.focus({ preventScroll: true });
    });
  }, []);

  // Close on Escape key & reposition on resize/scroll while open
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };

    const handleResize = () => updateAnchorPosition();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, handleClose, updateAnchorPosition]);

  const canGoNextMonth =
    viewYear < todayParts.year || (viewYear === todayParts.year && viewMonth < todayParts.month);

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (!canGoNextMonth) return;
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const calendarCells = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const cells: Array<{ day: number; dateStr: string } | null> = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ day, dateStr: toDateStr(viewYear, viewMonth, day) });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const handlePickDay = (dateStr: string) => {
    if (dateStr > todayDate) return;
    onSelectDate(dateStr);
    setOpen(false);
  };

  const handleResetToToday = () => {
    onSelectDate(todayDate);
    setOpen(false);
  };

  const hasAvailableDataMap = availableDates.size > 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={isCustomDate ? `已选历史日期 ${formatShortDateLabel(selectedDate)}，点击切换日期` : '选择历史日期'}
        className={[
          'inline-flex h-7 cursor-pointer select-none items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] tabular-nums',
          isCustomDate || open
            ? 'bg-white font-semibold text-[#1D1D1F] shadow-sm dark:bg-[#2C2C2E] dark:text-[#F5F5F7] dark:shadow-none dark:ring-1 dark:ring-white/15'
            : 'text-[#86868B] hover:text-[#1D1D1F] dark:hover:text-[#F5F5F7]',
        ].join(' ')}
      >
        <CalendarDays
          className={[
            'h-3.5 w-3.5 shrink-0',
            isCustomDate || open ? 'text-[#007AFF] dark:text-[#0A84FF]' : '',
          ].join(' ')}
          aria-hidden="true"
        />
        <span>{isCustomDate ? formatShortDateLabel(selectedDate) : '日期'}</span>
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div className="fixed inset-0 z-50">
                {/* Click-outside backdrop (soft dim on mobile, transparent on desktop) */}
                <motion.div
                  aria-hidden="true"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  onClick={handleClose}
                  className="fixed inset-0 bg-black/45 sm:bg-transparent"
                />

                {/* Custom Apple Dark Glass Popover Calendar */}
                <motion.div
                  ref={panelRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label="选择新闻日期"
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.8 }}
                  style={
                    desktopAnchor
                      ? {
                          position: 'fixed',
                          top: `${desktopAnchor.top}px`,
                          right: `${desktopAnchor.right}px`,
                        }
                      : undefined
                  }
                  className={[
                    'w-[min(19.5rem,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-[#1C1C1E]/95 p-4 text-[#F5F5F7] shadow-2xl backdrop-blur-2xl saturate-150',
                    desktopAnchor
                      ? ''
                      : 'fixed left-1/2 top-24 -translate-x-1/2',
                  ].join(' ')}
                >
                  {/* Month Navigation Header */}
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      aria-label="上个月"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#E5E5EA] transition-colors hover:bg-white/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>

                    <span className="text-sm font-semibold tracking-tight text-[#F5F5F7] tabular-nums">
                      {viewYear}年{viewMonth}月
                    </span>

                    <button
                      type="button"
                      onClick={handleNextMonth}
                      disabled={!canGoNextMonth}
                      aria-label="下个月"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#E5E5EA] transition-colors hover:bg-white/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  {/* Weekday Labels */}
                  <div className="mb-1.5 grid grid-cols-7 text-center">
                    {WEEKDAYS.map((wd) => (
                      <span
                        key={wd}
                        className="py-1 text-[11px] font-medium text-[#86868B]"
                      >
                        {wd}
                      </span>
                    ))}
                  </div>

                  {/* Day Grid */}
                  <div className="grid grid-cols-7 gap-y-1 text-center">
                    {calendarCells.map((cell, idx) => {
                      if (!cell) {
                        return <span key={`empty-${idx}`} aria-hidden="true" className="h-9" />;
                      }

                      const isFuture = cell.dateStr > todayDate;
                      const isSelected = cell.dateStr === selectedDate;
                      const isToday = cell.dateStr === todayDate;
                      const hasNews = availableDates.has(cell.dateStr);
                      const topicCount = countsByDate[cell.dateStr] ?? 0;

                      return (
                        <div key={cell.dateStr} className="flex items-center justify-center">
                          <button
                            type="button"
                            disabled={isFuture}
                            onClick={() => handlePickDay(cell.dateStr)}
                            aria-label={`${cell.dateStr}${isToday ? '（今天）' : ''}${hasNews ? `，共 ${topicCount} 篇新闻` : '，暂无新闻'}`}
                            aria-pressed={isSelected}
                            title={
                              isFuture
                                ? undefined
                                : hasNews
                                  ? `${cell.dateStr} · 共 ${topicCount} 篇主题报道`
                                  : `${cell.dateStr} · 暂无归档新闻`
                            }
                            className={[
                              'relative flex h-9 w-9 flex-col items-center justify-center rounded-xl text-[13px] transition-all tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]',
                              isFuture
                                ? 'cursor-not-allowed text-[#86868B]/30'
                                : isSelected
                                  ? 'cursor-pointer bg-[#0A84FF] font-semibold text-white shadow-[0_2px_10px_rgba(10,132,255,0.45)] active:scale-95'
                                  : isToday
                                    ? 'cursor-pointer bg-white/[0.08] font-semibold text-[#409CFF] ring-1 ring-[#0A84FF]/50 hover:bg-white/15 active:scale-95'
                                    : hasNews || !hasAvailableDataMap
                                      ? 'cursor-pointer font-medium text-[#F5F5F7] hover:bg-white/10 active:scale-95'
                                      : 'cursor-pointer font-normal text-[#86868B]/55 hover:bg-white/[0.06] hover:text-[#AEAEB2] active:scale-95',
                            ].join(' ')}
                          >
                            <span className="leading-none">{cell.day}</span>
                            {/* Micro dot indicator: news available (or today marker) */}
                            {(hasNews || isToday) && !isFuture && (
                              <span
                                aria-hidden="true"
                                className={[
                                  'mt-1 h-1 w-1 rounded-full',
                                  isSelected
                                    ? 'bg-white'
                                    : hasNews
                                      ? 'bg-[#0A84FF]'
                                      : 'bg-[#86868B]/70',
                                ].join(' ')}
                              />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer: Legend + Reset to Today CTA */}
                  <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-[#86868B]">
                      <span
                        aria-hidden="true"
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#0A84FF]"
                      />
                      <span className="truncate">
                        有新闻{visitorTimeZone ? ` · ${visitorTimeZone.split('/').pop()}` : ''}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleResetToToday}
                      className="shrink-0 cursor-pointer rounded-full bg-[#0A84FF]/15 px-3 py-1.5 text-xs font-semibold text-[#409CFF] transition-colors hover:bg-[#0A84FF]/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]"
                    >
                      回到今天
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
