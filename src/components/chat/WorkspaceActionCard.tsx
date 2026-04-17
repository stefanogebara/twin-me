import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, Calendar, FolderSearch, FileText, Table2, Users,
  Check, ChevronLeft, ChevronRight, Trash2, Pencil,
} from 'lucide-react';

interface ActionEvent {
  tool: string;
  params?: Record<string, any>;
  status: 'executing' | 'complete' | 'failed';
  data?: any;
  elapsedMs?: number;
}

interface WorkspaceActionCardProps {
  action: ActionEvent;
}

const ITEMS_PER_PAGE = 5;

const TOOL_CONFIG: Record<string, { icon: typeof Mail; label: string; executingLabel: string }> = {
  gmail_search: { icon: Mail, label: 'Gmail Search', executingLabel: 'Searching Gmail...' },
  gmail_read: { icon: Mail, label: 'Gmail', executingLabel: 'Reading email...' },
  gmail_send: { icon: Mail, label: 'Gmail Send', executingLabel: 'Sending email...' },
  gmail_draft: { icon: Mail, label: 'Gmail Draft', executingLabel: 'Creating draft...' },
  calendar_today: { icon: Calendar, label: 'Calendar', executingLabel: 'Checking calendar...' },
  calendar_upcoming: { icon: Calendar, label: 'Calendar', executingLabel: 'Loading events...' },
  calendar_create: { icon: Calendar, label: 'Calendar', executingLabel: 'Creating event...' },
  calendar_modify_event: { icon: Pencil, label: 'Calendar', executingLabel: 'Updating event...' },
  calendar_delete_event: { icon: Trash2, label: 'Calendar', executingLabel: 'Deleting event...' },
  drive_search: { icon: FolderSearch, label: 'Drive Search', executingLabel: 'Searching Drive...' },
  docs_create: { icon: FileText, label: 'Docs', executingLabel: 'Creating document...' },
  sheets_create: { icon: Table2, label: 'Sheets', executingLabel: 'Creating spreadsheet...' },
  contacts_search: { icon: Users, label: 'Contacts', executingLabel: 'Searching contacts...' },
};

function getToolConfig(tool: string) {
  return TOOL_CONFIG[tool] || { icon: FileText, label: tool, executingLabel: `Running ${tool}...` };
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function isListTool(tool: string): boolean {
  return ['gmail_search', 'gmail_read', 'calendar_today', 'calendar_upcoming', 'drive_search', 'contacts_search'].includes(tool);
}

function isWriteTool(tool: string): boolean {
  return ['calendar_create', 'calendar_modify_event', 'calendar_delete_event', 'gmail_send', 'gmail_draft', 'docs_create', 'sheets_create'].includes(tool);
}

function getResultItems(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.messages) return data.messages;
  if (data.emails) return data.emails;
  if (data.events) return data.events;
  if (data.files) return data.files;
  if (data.contacts) return data.contacts;
  if (data.results) return data.results;
  return [];
}

function EmailItem({ item, isLast }: { item: any; isLast: boolean }) {
  return (
    <div
      className="py-2"
      style={{ borderBottom: isLast ? undefined : '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="flex justify-between items-start gap-2">
        <span className="text-[13px] font-medium" style={{ color: '#F5F5F4' }}>
          {item.from || item.sender || 'Unknown'}
        </span>
        <span className="text-[11px] ml-2 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {formatRelativeTime(item.date || item.receivedAt || item.timestamp || '')}
        </span>
      </div>
      <div className="text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
        {item.subject || '(no subject)'}
      </div>
      {(item.snippet || item.preview) && (
        <div className="text-[12px] line-clamp-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {item.snippet || item.preview}
        </div>
      )}
    </div>
  );
}

function CalendarItem({ item, isLast }: { item: any; isLast: boolean }) {
  return (
    <div
      className="py-2"
      style={{ borderBottom: isLast ? undefined : '1px solid rgba(255,255,255,0.04)' }}
    >
      <span className="text-[13px] font-medium" style={{ color: '#F5F5F4' }}>
        {item.summary || item.title || 'Untitled event'}
      </span>
      <div className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {(typeof item.start === 'object' ? item.start?.dateTime || item.start?.date : item.start) || item.time || ''}
        {item.end ? ` - ${typeof item.end === 'object' ? item.end?.dateTime || item.end?.date : item.end}` : ''}
      </div>
      {item.location && (
        <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {item.location}
        </div>
      )}
    </div>
  );
}

function DriveItem({ item, isLast }: { item: any; isLast: boolean }) {
  return (
    <div
      className="py-2 flex justify-between items-center"
      style={{ borderBottom: isLast ? undefined : '1px solid rgba(255,255,255,0.04)' }}
    >
      <div>
        <span className="text-[13px] font-medium" style={{ color: '#F5F5F4' }}>
          {item.name || item.title || 'Untitled'}
        </span>
        {item.mimeType && (
          <span className="text-[11px] ml-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {item.mimeType.split('.').pop() || ''}
          </span>
        )}
      </div>
      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
        {formatRelativeTime(item.modifiedTime || item.modified || '')}
      </span>
    </div>
  );
}

function ContactItem({ item, isLast }: { item: any; isLast: boolean }) {
  return (
    <div
      className="py-2"
      style={{ borderBottom: isLast ? undefined : '1px solid rgba(255,255,255,0.04)' }}
    >
      <span className="text-[13px] font-medium" style={{ color: '#F5F5F4' }}>
        {item.name || item.displayName || 'Unknown'}
      </span>
      {item.email && (
        <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {item.email}
        </div>
      )}
      {item.phone && (
        <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {item.phone}
        </div>
      )}
    </div>
  );
}

function ResultItem({ item, tool, isLast }: { item: any; tool: string; isLast: boolean }) {
  if (tool.startsWith('gmail')) return <EmailItem item={item} isLast={isLast} />;
  if (tool.startsWith('calendar')) return <CalendarItem item={item} isLast={isLast} />;
  if (tool.startsWith('drive')) return <DriveItem item={item} isLast={isLast} />;
  if (tool.startsWith('contacts')) return <ContactItem item={item} isLast={isLast} />;
  return <DriveItem item={item} isLast={isLast} />;
}

function WriteResult({ data, tool }: { data: any; tool: string }) {
  const title = data?.summary || data?.subject || data?.title || data?.name || 'Item';
  const verb = tool === 'calendar_modify_event' ? 'Updated'
    : tool === 'calendar_delete_event' ? 'Deleted'
    : 'Created';
  const label = tool === 'calendar_delete_event' ? 'event' : title;
  return (
    <div className="flex items-center gap-2 py-1">
      <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#10b77f' }} />
      <span className="text-[13px]" style={{ color: '#F5F5F4' }}>
        {verb}: {label}
      </span>
    </div>
  );
}

export function WorkspaceActionCard({ action }: WorkspaceActionCardProps) {
  const config = getToolConfig(action.tool);
  const Icon = config.icon;
  const [expanded, setExpanded] = useState(true);
  const [page, setPage] = useState(0);

  const items = useMemo(() => getResultItems(action.data), [action.data]);
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const visibleItems = items.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  const shouldAutoCollapse = items.length > ITEMS_PER_PAGE;

  if (action.status === 'executing') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[rgba(255,255,255,0.06)] rounded-[20px] border border-[rgba(255,255,255,0.06)] px-5 py-4 mb-3"
        style={{ boxShadow: 'inset 0 0 7px 1px rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center gap-2 animate-pulse">
          <Icon className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
          <span
            className="text-[11px] uppercase tracking-[0.15em] font-medium"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            {config.executingLabel}
          </span>
        </div>
      </motion.div>
    );
  }

  if (action.status === 'failed') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-[rgba(255,255,255,0.06)] rounded-[20px] border border-[rgba(255,255,255,0.06)] px-5 py-4 mb-3"
        style={{ boxShadow: 'inset 0 0 7px 1px rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: 'rgba(239,68,68,0.6)' }} />
          <span
            className="text-[11px] uppercase tracking-[0.15em] font-medium"
            style={{ color: 'rgba(239,68,68,0.6)' }}
          >
            {config.label} failed
          </span>
        </div>
      </motion.div>
    );
  }

  if (isWriteTool(action.tool)) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-[rgba(255,255,255,0.06)] rounded-[20px] border border-[rgba(255,255,255,0.06)] px-5 py-4 mb-3"
        style={{ boxShadow: 'inset 0 0 7px 1px rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
          <span
            className="text-[11px] uppercase tracking-[0.15em] font-medium"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            {config.label} {action.elapsedMs != null ? `\u00b7 ${action.elapsedMs}ms` : ''}
          </span>
        </div>
        <WriteResult data={action.data} tool={action.tool} />
      </motion.div>
    );
  }

  if (isListTool(action.tool) && items.length > 0) {
    const isExpanded = shouldAutoCollapse ? expanded : true;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-[rgba(255,255,255,0.06)] rounded-[20px] border border-[rgba(255,255,255,0.06)] px-5 py-4 mb-3"
        style={{ boxShadow: 'inset 0 0 7px 1px rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
            <span
              className="text-[11px] uppercase tracking-[0.15em] font-medium"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              {config.label} {'\u00b7'} {items.length} result{items.length !== 1 ? 's' : ''}
              {action.elapsedMs != null ? ` \u00b7 ${action.elapsedMs}ms` : ''}
            </span>
          </div>
          {shouldAutoCollapse && (
            <button
              onClick={() => setExpanded(prev => !prev)}
              className="text-[11px] transition-opacity hover:opacity-70"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              {visibleItems.map((item, i) => (
                <ResultItem
                  key={`${action.tool}-${page}-${i}`}
                  item={item}
                  tool={action.tool}
                  isLast={i === visibleItems.length - 1}
                />
              ))}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1 transition-opacity disabled:opacity-20 hover:opacity-70"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span
                    className="text-[10px] uppercase tracking-[0.15em]"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
                  >
                    {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                    className="p-1 transition-opacity disabled:opacity-20 hover:opacity-70"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-[rgba(255,255,255,0.06)] rounded-[20px] border border-[rgba(255,255,255,0.06)] px-5 py-4 mb-3"
        style={{ boxShadow: 'inset 0 0 7px 1px rgba(255,255,255,0.1)' }}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
        <span
          className="text-[11px] uppercase tracking-[0.15em] font-medium"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          {config.label}
          {action.elapsedMs != null ? ` \u00b7 ${action.elapsedMs}ms` : ''}
        </span>
      </div>
    </motion.div>
  );
}
