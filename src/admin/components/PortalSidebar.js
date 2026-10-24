import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { collection, collectionGroup, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import {
  AnimatedSidebar,
  AnimatedSidebarContent,
  AnimatedSidebarFooter,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupLabel,
  AnimatedSidebarHeader,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem,
  AnimatedSidebarMenuSub,
  AnimatedSidebarMenuSubButton,
  AnimatedSidebarMenuSubItem,
  AnimatedSidebarRail,
  useAnimatedSidebar,
} from '../../components/ui/animated-sidebar.tsx';

const MENU_GROUPS = [
  {
    label: 'Front Desk / Operations',
    icon: 'ti ti-building-store',
    children: ['Reservations', 'Walk-in', 'Room Management', 'Booking Transactions'],
  },
  {
    label: 'Financials',
    icon: 'ti ti-cash',
    children: ['Billing', 'Payments'],
  },
  {
    label: 'Guest Relations',
    icon: 'ti ti-users',
    children: ['Customers', 'Promos & Discounts', 'Feedback & QR'],
  },
  {
    label: 'Communications',
    icon: 'ti ti-messages',
    children: ['Contact Inquiries', 'Email', 'Messages'],
  },
  {
    label: 'Management & Logs',
    icon: 'ti ti-settings-cog',
    children: ['Reports', 'History', 'News Management', 'Users', 'Cancellation'],
  },
];

const searchableCollections = [
  {
    name: 'rooms',
    label: 'Room',
    path: (prefix) => `${prefix}/rooms`,
    fields: ['roomNumber', 'name', 'type', 'status'],
    title: (data) => `Room ${data.roomNumber || data.name || ''}`.trim(),
    detail: (data) => [data.type, data.status].filter(Boolean).join(' · '),
  },
  {
    name: 'reservations',
    label: 'Reservation',
    path: (prefix) => `${prefix}/reservations`,
    fields: ['guestName', 'email', 'phone', 'roomNumber', 'status', 'reservationCode', 'bookingCode'],
    title: (data) => data.guestName || 'Reservation',
    detail: (data) => [`Room ${data.roomNumber || '—'}`, data.status].filter(Boolean).join(' · '),
  },
  {
    name: 'payments',
    label: 'Payment',
    path: (prefix) => `${prefix}/${prefix === '/admin' ? 'payments' : 'transactions'}`,
    fields: ['guestName', 'roomNumber', 'reservationId', 'amount', 'method', 'status'],
    title: (data) => data.guestName || 'Payment',
    detail: (data) => [`Room ${data.roomNumber || '—'}`, data.amount ? `₱${data.amount}` : null, data.method].filter(Boolean).join(' · '),
  },
  {
    name: 'conversations',
    label: 'Message',
    path: (prefix) => `${prefix}/messages`,
    fields: ['guestName', 'guestPhone', 'lastMessage'],
    title: (data) => data.guestName || 'Guest conversation',
    detail: (data) => data.lastMessage || data.guestPhone || 'Conversation',
  },
  {
    name: 'messages',
    label: 'Message',
    path: (prefix) => `${prefix}/messages`,
    fields: ['text', 'sender'],
    title: (data) => data.text || 'Message',
    detail: (data, id) => `Conversation ${id} · ${data.sender || 'Guest'}`,
    collectionGroup: true,
  },
];

function PortalGlobalSearch({ navItems, portalName }) {
  const { isMobile, state, setOpen, setOpenMobile } = useAnimatedSidebar();
  const [term, setTerm] = useState('');
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const cacheRef = useRef(null);
  const timerRef = useRef(null);
  const prefix = portalName === 'Admin' ? '/admin' : '/receptionist';
  const normalizedTerm = term.trim().toLocaleLowerCase();

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (normalizedTerm.length < 2 || records || loading) return undefined;

    timerRef.current = window.setTimeout(() => {
      setLoading(true);
      setError('');
      if (!cacheRef.current) {
        // Each kind of record is loaded on its own: if one can't be read
        // (permissions, offline), the others are still searchable.
        cacheRef.current = Promise.allSettled(
          searchableCollections.map(async (config) => {
              const snapshot = await getDocs(
                config.collectionGroup
                  ? collectionGroup(db, config.name)
                  : collection(db, config.name),
              );
              return snapshot.docs.map((document) => ({
                config,
                id: config.collectionGroup ? document.ref.parent.parent?.id || document.id : document.id,
                documentId: document.id,
                data: document.data(),
              }));
          }),
        ).then((outcomes) => {
          const loaded = outcomes.filter((outcome) => outcome.status === 'fulfilled');
          outcomes.forEach((outcome, index) => {
            if (outcome.status === 'rejected') console.warn(`Search skipped ${searchableCollections[index].name}:`, outcome.reason?.message);
          });
          if (!loaded.length) throw new Error('No records could be loaded for search.');
          return loaded.flatMap((outcome) => outcome.value);
        });
      }

      cacheRef.current
        .then(setRecords)
        .catch((searchError) => {
          cacheRef.current = null;
          console.error('Unable to search resort records:', searchError);
          setError('Search is unavailable. Check your connection and try again.');
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => window.clearTimeout(timerRef.current);
  }, [loading, normalizedTerm, records]);

  const pageResults = normalizedTerm.length > 0
    ? navItems.filter((item) => item.label.toLocaleLowerCase().includes(normalizedTerm))
      .slice(0, 4)
      .map((item) => ({
        id: item.path,
        kind: 'Page',
        title: item.label,
        detail: 'Open section',
        path: item.path,
      }))
    : [];

  const recordResults = normalizedTerm.length >= 2 && records
    ? records
      .filter(({ config, id, data }) =>
        [id, ...config.fields.map((field) => data[field])]
          .filter((value) => value !== undefined && value !== null)
          .some((value) => String(value).toLocaleLowerCase().includes(normalizedTerm)),
      )
      .slice(0, 8)
      .map(({ config, id, documentId, data }) => ({
        id: `${config.name}-${documentId}`,
        kind: config.label,
        title: config.title(data),
        detail: config.detail(data, id),
        path: config.path(prefix),
      }))
    : [];

  const results = [...pageResults, ...recordResults].slice(0, 10);
  const showResults = focused && normalizedTerm.length > 0;
  const collapsed = !isMobile && state === 'collapsed';

  const openResult = () => {
    if (isMobile) setOpenMobile(false);
    setFocused(false);
  };

  if (collapsed) {
    return (
      <div className="flex justify-center px-2 pb-2">
        <button
          type="button"
          aria-label="Search the system"
          title="Search the system"
          onClick={() => setOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative z-20 px-3 pb-3">
      <label className="relative block">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setTerm('');
              setFocused(false);
              event.currentTarget.blur();
            }
            if (event.key === 'Enter' && results[0]) window.location.href = results[0].path;
          }}
          placeholder="Search the system..."
          aria-label="Search pages, rooms, reservations, guests, payments, and messages"
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs text-foreground outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
        />
      </label>
      {showResults && (
        <div className="absolute left-3 right-3 top-full z-50 max-h-[min(45vh,360px)] overflow-y-auto rounded-xl border border-border bg-background p-1.5 shadow-xl">
          {normalizedTerm.length < 2 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Type at least 2 characters to search records.</div>
          ) : loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Searching...</div>
          ) : results.length ? (
            <>
              {results.map((result) => (
                <a
                  key={result.id}
                  href={result.path}
                  onMouseDown={openResult}
                  className="flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-foreground no-underline transition-colors hover:bg-muted"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <i className={`ti ${result.kind === 'Page' ? 'ti-layout-dashboard' : 'ti-search'} text-sm`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{result.title}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">{result.kind} · {result.detail}</span>
                  </span>
                </a>
              ))}
              {error && <div role="alert" className="px-3 py-2 text-xs text-red-600">{error}</div>}
            </>
          ) : error ? (
            <div role="alert" className="px-3 py-2 text-xs text-red-600">{error}</div>
          ) : records ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No matching pages or records found.</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SidebarAccount({ name, role, email, initials, onLogout }) {
  const { isMobile, state } = useAnimatedSidebar();
  const collapsed = !isMobile && state === 'collapsed';

  return (
    <AnimatedSidebarFooter className="gap-3">
      {!collapsed && (
        <div className="flex min-w-0 items-center gap-2.5 px-1">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-xs font-bold text-[var(--accent-foreground)]">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-foreground">{name}</div>
            <div className="truncate text-[10px] capitalize text-muted-foreground">{role}</div>
            {email && <div className="max-w-[150px] truncate text-[9px] text-muted-foreground">{email}</div>}
          </div>
        </div>
      )}
      <AnimatedSidebarMenu>
        <AnimatedSidebarMenuItem>
          <AnimatedSidebarMenuButton
            icon={<i className="ti ti-logout" />}
            onSelect={onLogout}
          >
            Sign out
          </AnimatedSidebarMenuButton>
        </AnimatedSidebarMenuItem>
      </AnimatedSidebarMenu>
    </AnimatedSidebarFooter>
  );
}

export default function PortalSidebar({
  navItems,
  currentPath,
  unreadCount = 0,
  emailUnread = 0,
  logo,
  portalName,
  name,
  role,
  email,
  initials,
  onLogout,
}) {
  const { isMobile, state } = useAnimatedSidebar();
  const collapsed = !isMobile && state === 'collapsed';
  const [expandedMenus, setExpandedMenus] = useState(() => {
    const activeGroup = MENU_GROUPS.find((group) =>
      group.children.some((label) =>
        navItems.some((item) => item.label === label && item.path === currentPath),
      ),
    );
    return activeGroup ? { [activeGroup.label]: true } : {};
  });
  const toggleGroup = (label) => {
    setExpandedMenus((previous) => ({ ...previous, [label]: !previous[label] }));
  };
  const linkFor = (label) => navItems.find((item) => item.label === label);
  const badgeFor = (item) => {
    const count = item.path === '/admin/email'
      ? emailUnread
      : item.path.endsWith('/messages')
        ? unreadCount
        : 0;
    return count > 0 ? (count > 9 ? '9+' : count) : null;
  };
  const dashboard = linkFor('Dashboard');
  const settings = linkFor('Settings');

  return (
    <AnimatedSidebar
      ariaLabel={`${portalName} navigation`}
      collapsible="icon"
      panelClassName="border-border bg-background"
      className="portal-sidebar"
    >
      <AnimatedSidebarHeader className="shrink-0 gap-3 border-border border-b px-3 py-3">
        <div className="flex min-h-[48px] min-w-0 items-center gap-2.5">
          <img src={logo} alt="Lawiswis Kawayan Garden Resort" className="h-10 w-8 shrink-0 rounded-md object-cover" />
          {!collapsed && (
            <div className="min-w-0 whitespace-nowrap">
              <div className="text-xs font-bold leading-tight text-foreground">Lawiswis Kawayan</div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--accent)]">Garden Resort</div>
              <div className="mt-0.5 text-[9px] text-muted-foreground">{`HuaPro ${portalName}`}</div>
            </div>
          )}
        </div>
        <PortalGlobalSearch navItems={navItems} portalName={portalName} />
      </AnimatedSidebarHeader>

      <AnimatedSidebarContent>
        <AnimatedSidebarGroup>
          {!collapsed && (
            <AnimatedSidebarGroupLabel className="px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Workspace
            </AnimatedSidebarGroupLabel>
          )}
          <AnimatedSidebarMenu>
            {dashboard && (
              <AnimatedSidebarMenuItem key={dashboard.path}>
                <AnimatedSidebarMenuButton
                  href={dashboard.path}
                  icon={<i className={`ti ${dashboard.icon}`} />}
                  isActive={currentPath === dashboard.path}
                >
                  {dashboard.label}
                </AnimatedSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            )}

            {MENU_GROUPS.map((group) => {
              const items = group.children.map(linkFor).filter(Boolean);
              if (!items.length) return null;

              const isActive = items.some((item) => item.path === currentPath);
              const isExpanded = Boolean(expandedMenus[group.label]);
              return (
                <AnimatedSidebarMenuItem key={group.label}>
                  <AnimatedSidebarMenuButton
                    icon={<i className={group.icon} />}
                    isActive={isActive}
                    ariaExpanded={isExpanded}
                    closeOnSelect={false}
                    onSelect={() => toggleGroup(group.label)}
                  >
                    {group.label}
                  </AnimatedSidebarMenuButton>
                  <AnimatedSidebarMenuSub open={isExpanded}>
                    {items.map((item) => {
                      const badge = badgeFor(item);
                      return (
                        <AnimatedSidebarMenuSubItem key={item.path}>
                          <AnimatedSidebarMenuSubButton
                            href={item.path}
                            icon={<i className={`ti ${item.icon}`} />}
                            isActive={currentPath === item.path}
                          >
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            {badge && (
                              <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white">
                                {badge}
                              </span>
                            )}
                          </AnimatedSidebarMenuSubButton>
                        </AnimatedSidebarMenuSubItem>
                      );
                    })}
                  </AnimatedSidebarMenuSub>
                </AnimatedSidebarMenuItem>
              );
            })}

            {settings && (
              <AnimatedSidebarMenuItem key={settings.path}>
                <AnimatedSidebarMenuButton
                  href={settings.path}
                  icon={<i className={`ti ${settings.icon}`} />}
                  isActive={currentPath === settings.path}
                >
                  {settings.label}
                </AnimatedSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            )}
          </AnimatedSidebarMenu>
        </AnimatedSidebarGroup>
      </AnimatedSidebarContent>

      <SidebarAccount
        name={name || portalName}
        role={role}
        email={email}
        initials={initials}
        onLogout={onLogout}
      />
      <AnimatedSidebarRail aria-label="Collapse or expand sidebar" />
    </AnimatedSidebar>
  );
}
