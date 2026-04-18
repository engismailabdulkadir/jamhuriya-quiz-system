import { useEffect, useMemo, useState } from 'react';
import logo from '../../assets/jamhuuriyo.png';
import { iconMap } from './iconMap.js';
import { isPathMatchingMenuPath } from '../config/menuConfig.js';
import { getAdminAttempts, getTeacherAttempts } from '../../services/api.js';

const { ChevronDown, ChevronLeft, ChevronRight, Search } = iconMap;
const STATIC_MENU_BADGES = {
  Notifications: 3,
  'Cheating Logs': 2
};

function Sidebar({
  menuGroups,
  currentPath,
  onNavigate,
  collapsed,
  onCloseMobile,
  onToggleCollapse
}) {
  const getBestMatchingChildPath = (section) => {
    const matches = section.children.filter((child) => isPathMatchingMenuPath(currentPath, child.path));
    if (matches.length === 0) return null;

    matches.sort((a, b) => b.path.length - a.path.length);
    return matches[0].path;
  };

  const activeSectionLabel = useMemo(() => {
    for (const group of menuGroups) {
      for (const section of group.items) {
        if (section.children.some((child) => isPathMatchingMenuPath(currentPath, child.path))) {
          return section.label;
        }
      }
    }

    return null;
  }, [menuGroups, currentPath]);

  const [openSection, setOpenSection] = useState(activeSectionLabel);
  const [attemptsBadgeCount, setAttemptsBadgeCount] = useState(null);

  useEffect(() => {
    if (collapsed) {
      setOpenSection(null);
      return;
    }

    setOpenSection(activeSectionLabel);
  }, [activeSectionLabel, collapsed]);

  useEffect(() => {
    const hasAttemptsSection = menuGroups.some((group) =>
      group.items.some((section) => section.label === 'Attempts')
    );
    if (!hasAttemptsSection) {
      setAttemptsBadgeCount(null);
      return;
    }

    const isAdminMenu = menuGroups.some((group) =>
      group.items.some((section) =>
        section.children.some((child) => String(child.path).startsWith('/admin/'))
      )
    );

    let active = true;
    let timerId = null;

    const loadAttemptsCount = async () => {
      try {
        const response = isAdminMenu
          ? await getAdminAttempts({ status: 'ongoing', limit: 1 })
          : await getTeacherAttempts({ status: 'ongoing', limit: 1 });

        if (!active) return;
        const count = Number(response?.summary?.ongoing ?? 0);
        setAttemptsBadgeCount(Number.isFinite(count) ? Math.max(0, count) : 0);
      } catch {
        if (!active) return;
        setAttemptsBadgeCount(0);
      }
    };

    loadAttemptsCount();
    timerId = window.setInterval(loadAttemptsCount, 30000);

    return () => {
      active = false;
      if (timerId) {
        window.clearInterval(timerId);
      }
    };
  }, [menuGroups, currentPath]);

  const toggleSection = (label) => {
    setOpenSection((prev) => (prev === label ? null : label));
  };

  const isSectionActive = (section) =>
    section.children.some((child) => isPathMatchingMenuPath(currentPath, child.path));

  const openSectionOrNavigate = (section) => {
    if (collapsed) {
      onNavigate(section.children[0].path);
      onCloseMobile?.();
      return;
    }

    toggleSection(section.label);
  };

  return (
    <aside
      className={`flex h-full w-64 flex-col border-r border-[#d2deea] bg-[radial-gradient(circle_at_70%_45%,rgba(232,201,227,0.48),transparent_42%),linear-gradient(180deg,#bdd9ea_0%,#dae2ef_34%,#e4d8e9_70%,#d9cee3_100%)] text-slate-700 shadow-xl backdrop-blur-xl transition-all duration-200 ${
        collapsed ? 'md:w-16' : 'md:w-64'
      }`}
    >
      <div className="relative border-b border-slate-200/70 px-3 py-4">
        <div className={`${collapsed ? 'flex justify-center' : ''}`}>
          {collapsed ? (
            <div className="rounded-full bg-white p-1 shadow-sm">
              <img src={logo} alt="Jamhuriyo" className="h-7 w-7 rounded-full object-cover" />
            </div>
          ) : (
            <div className="mx-1 px-3 pb-2 pt-2">
              <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-white p-1 shadow-md">
                <img src={logo} alt="Jamhuriyo" className="h-full w-full rounded-full object-cover" />
              </div>
              <p className="truncate text-center text-xl font-bold leading-tight text-slate-800">Jamhuriya Quize</p>
            </div>
          )}

          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="absolute -right-3 top-6 hidden rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition hover:border-indigo-200 hover:text-indigo-500 md:inline-flex"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          ) : null}
        </div>
      </div>

      {!collapsed ? (
        <div className="px-3 py-3">
          <div className="flex items-center gap-2 rounded-2xl border border-[#e3e7ee] bg-[#f5f6f8] px-3 py-2.5 shadow-sm">
            <Search className="h-4 w-4 text-[#6f8098]" />
            <input
              type="text"
              placeholder="Search"
              className="w-full bg-transparent text-sm text-[#5a6f89] outline-none placeholder:text-[#8ea0b7]"
            />
          </div>
        </div>
      ) : null}

      <nav className="flex-1 overflow-x-visible overflow-y-auto px-2 py-3">
        {menuGroups.map((group) => (
          <div key={group.section} className="mb-4">
            {!collapsed ? (
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#657791]">
                {group.section}
              </p>
            ) : null}

            <ul className="space-y-2">
              {group.items.map((section) => {
                const SectionIcon = iconMap[section.icon] ?? iconMap.LayoutDashboard;
                const expanded = openSection === section.label;
                const hasActiveChild = isSectionActive(section);
                const activeChildPath = getBestMatchingChildPath(section);
                const badgeCount =
                  section.label === 'Attempts'
                    ? attemptsBadgeCount
                    : STATIC_MENU_BADGES[section.label];

                return (
                  <li key={section.label}>
                    <button
                      type="button"
                      title={collapsed ? section.label : ''}
                      onClick={() => openSectionOrNavigate(section)}
                      className={`group relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold transition ${hasActiveChild
                        ? 'bg-[#d8e1ed] text-[#2450cf] shadow-sm ring-1 ring-[#c2d6ea]'
                        : 'text-[#334a63] hover:bg-white/50 hover:text-[#334a63]'
                        }`}
                    >
                      <span className="flex items-center gap-3">
                        <SectionIcon
                          className={`h-4 w-4 transition ${hasActiveChild
                            ? 'text-[#2450cf]'
                            : 'text-[#50657f] group-hover:-translate-y-0.5 group-hover:text-[#2450cf]'
                            }`}
                        />
                        {!collapsed ? section.label : null}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {badgeCount !== undefined && badgeCount !== null ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                              hasActiveChild ? 'bg-[#d2dcff] text-[#4a59d9]' : 'bg-[#6466ef] text-white'
                            }`}
                          >
                            {badgeCount}
                          </span>
                        ) : null}
                        {!collapsed ? (
                          expanded ? (
                            <ChevronDown className={`h-3.5 w-3.5 ${hasActiveChild ? 'text-[#2450cf]' : 'text-[#5f7289]'}`} />
                          ) : (
                            <ChevronRight className={`h-3.5 w-3.5 ${hasActiveChild ? 'text-[#2450cf]' : 'text-[#5f7289]'}`} />
                          )
                        ) : null}
                      </span>
                      {collapsed ? (
                        <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-md group-hover:block">
                          {section.label}
                        </span>
                      ) : null}
                    </button>

                    {!collapsed ? (
                      <ul
                        className={`mt-1.5 space-y-1.5 overflow-hidden border-l border-[#c6d1e0] pl-5 transition-all duration-200 ${expanded ? 'max-h-80 pb-2' : 'max-h-0'
                          }`}
                      >
                        {section.children.map((child) => {
                          const active = activeChildPath === child.path;
                          return (
                            <li key={child.path}>
                              <button
                                type="button"
                                onClick={() => {
                                  onNavigate(child.path);
                                  onCloseMobile?.();
                                }}
                                className={`w-full rounded-xl px-3 py-2.5 text-left text-[15px] transition ${active
                                  ? 'bg-gradient-to-r from-[#6366f1] to-[#5e67ea] font-semibold text-white'
                                  : 'text-[#435a74] hover:bg-white/45 hover:text-[#334a63]'
                                  }`}
                              >
                                {child.label}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

    </aside>
  );
}

export default Sidebar;
