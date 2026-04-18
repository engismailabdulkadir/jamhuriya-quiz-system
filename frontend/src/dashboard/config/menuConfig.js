export const adminMenuGroups = [
  {
    section: 'Main Management',
    items: [
      {
        label: 'Dashboard',
        icon: 'LayoutDashboard',
        children: [
          { label: 'Overview', path: '/admin/dashboard', view: 'overview' },
          { label: 'Statistics', path: '/admin/dashboard/statistics', view: 'stats' },
          { label: 'Recent Activity', path: '/admin/dashboard/activity', view: 'activity' }
        ]
      },
      {
        label: 'Users',
        icon: 'Users',
        children: [
          { label: 'Add User', path: '/admin/users/add', view: 'modalForm' },
          { label: 'Manage Users', path: '/admin/users', view: 'table' },
          { label: 'User Roles', path: '/admin/users/roles', view: 'table' },
          { label: 'Active Users', path: '/admin/users/active', view: 'table' },
          { label: 'Blocked Users', path: '/admin/users/blocked', view: 'table' }
        ]
      },
      {
        label: 'Roles & Permissions',
        icon: 'ShieldCheck',
        children: [
          { label: 'Add Role', path: '/admin/roles/add', view: 'modalForm' },
          { label: 'Manage Roles', path: '/admin/roles', view: 'table' },
          { label: 'Assign Permissions', path: '/admin/roles/assign-permissions', view: 'fullPageForm' },
          { label: 'Role List', path: '/admin/roles/list', view: 'table' }
        ]
      },
      {
        label: 'Notifications',
        icon: 'Bell',
        children: [
          { label: 'Send Notification', path: '/admin/notifications/send', view: 'modalForm' },
          { label: 'Manage Notifications', path: '/admin/notifications', view: 'table' },
          { label: 'Announcements', path: '/admin/notifications/announcements', view: 'table' }
        ]
      },
      {
        label: 'Reports / Analytics',
        icon: 'BarChart3',
        children: [
          { label: 'Student Reports', path: '/admin/reports/students', view: 'table' },
          { label: 'Quiz Reports', path: '/admin/reports/quizzes', view: 'table' },
          { label: 'Cheating Reports', path: '/admin/reports/cheating', view: 'table' },
          { label: 'Performance Analytics', path: '/admin/reports/performance', view: 'stats' }
        ]
      }
    ]
  },
  {
    section: 'Academic Management',
    items: [
      {
        label: 'Rooms',
        icon: 'Building2',
        children: [
          { label: 'Add Room', path: '/admin/rooms/add', view: 'modalForm' },
          { label: 'Manage Rooms', path: '/admin/rooms', view: 'table' },
          { label: 'Assign Students', path: '/admin/rooms/assign-students', view: 'fullPageForm' },
          { label: 'Active Rooms', path: '/admin/rooms/active', view: 'table' }
        ]
      },
      {
        label: 'Quizzes',
        icon: 'ClipboardCheck',
        children: [
          { label: 'Quiz', path: '/admin/quizzes/add', view: 'fullPageForm' },
          { label: 'Manage Quiz', path: '/admin/quizzes', view: 'table' },
          { label: 'Questions', path: '/admin/quizzes/questions', view: 'fullPageForm' },
          { label: 'Settings', path: '/admin/quizzes/settings', view: 'fullPageForm' },
          { label: 'Results', path: '/admin/quizzes/results', view: 'table' }
        ]
      },
      {
        label: 'Attempts',
        icon: 'Timer',
        children: [
          { label: 'View Attempts', path: '/admin/attempts', view: 'table' },
          { label: 'Ongoing Attempts', path: '/admin/attempts/ongoing', view: 'table' },
          { label: 'Cancelled Attempts', path: '/admin/attempts/cancelled', view: 'table' },
          { label: 'Completed Attempts', path: '/admin/attempts/completed', view: 'table' }
        ]
      },
      {
        label: 'Cheating Logs',
        icon: 'ShieldAlert',
        children: [
          { label: 'View Logs', path: '/admin/cheating-logs', view: 'table' },
          { label: 'Suspicious Activities', path: '/admin/cheating-logs/suspicious', view: 'table' },
          { label: 'Violations', path: '/admin/cheating-logs/violations', view: 'table' },
          { label: 'Review Cases', path: '/admin/cheating-logs/review', view: 'fullPageForm' }
        ]
      }
    ]
  }
];

export const teacherMenuGroups = [
  {
    section: 'Main Management',
    items: [
      {
        label: 'Dashboard',
        icon: 'LayoutDashboard',
        children: [
          { label: 'Overview', path: '/teacher/dashboard', view: 'overview' },
          { label: 'Statistics', path: '/teacher/dashboard/statistics', view: 'stats' },
          { label: 'Recent Activity', path: '/teacher/dashboard/activity', view: 'activity' }
        ]
      },
      {
        label: 'Notifications',
        icon: 'Bell',
        children: [
          { label: 'Send Notification', path: '/teacher/notifications/send', view: 'modalForm' },
          { label: 'Announcements', path: '/teacher/notifications/announcements', view: 'table' }
        ]
      },
      {
        label: 'Reports',
        icon: 'BarChart3',
        children: [
          { label: 'Quiz Reports', path: '/teacher/reports/quizzes', view: 'table' },
          { label: 'Student Reports', path: '/teacher/reports/students', view: 'table' }
        ]
      }
    ]
  },
  {
    section: 'Academic Management',
    items: [
      {
        label: 'Rooms',
        icon: 'Building2',
        children: [
          { label: 'My Rooms', path: '/teacher/rooms', view: 'table' },
          { label: 'Active Rooms', path: '/teacher/rooms/active', view: 'table' },
          { label: 'Assign Students', path: '/teacher/rooms/assign-students', view: 'fullPageForm' }
        ]
      },
      {
        label: 'Quizzes',
        icon: 'ClipboardCheck',
        children: [
          { label: 'Quiz', path: '/teacher/quizzes/add', view: 'fullPageForm' },
          { label: 'Manage Quiz', path: '/teacher/quizzes', view: 'table' },
          { label: 'Questions', path: '/teacher/quizzes/questions', view: 'fullPageForm' },
          { label: 'Quiz Settings', path: '/teacher/quizzes/settings', view: 'fullPageForm' },
          { label: 'Quiz Results', path: '/teacher/quizzes/results', view: 'table' }
        ]
      },
      {
        label: 'Attempts',
        icon: 'Timer',
        children: [
          { label: 'View Attempts', path: '/teacher/attempts', view: 'table' },
          { label: 'Ongoing Attempts', path: '/teacher/attempts/ongoing', view: 'table' },
          { label: 'Submitted Attempts', path: '/teacher/attempts/submitted', view: 'table' },
          { label: 'Cancelled Attempts', path: '/teacher/attempts/cancelled', view: 'table' }
        ]
      },
      {
        label: 'Students',
        icon: 'GraduationCap',
        children: [
          { label: 'Student List', path: '/teacher/students', view: 'table' },
          { label: 'Student Performance', path: '/teacher/students/performance', view: 'stats' }
        ]
      }
    ]
  }
];

function flattenGroups(groups) {
  return groups.flatMap((group) => group.items);
}

export function getMenuGroupsByRole(role) {
  return role === 'admin' ? adminMenuGroups : teacherMenuGroups;
}

export function getFlatMenuByRole(role) {
  return flattenGroups(getMenuGroupsByRole(role));
}

export function getPathsByRole(role) {
  return getFlatMenuByRole(role).flatMap((item) => item.children.map((child) => child.path));
}

export function isPathMatchingMenuPath(path, menuPath) {
  if (path === menuPath) return true;
  return path.startsWith(`${menuPath}/`);
}

export function isPathInRoleMenu(role, path) {
  const paths = getPathsByRole(role);
  return paths.some((menuPath) => isPathMatchingMenuPath(path, menuPath));
}

export function findMenuItemByPath(menuGroups, path) {
  for (const group of menuGroups) {
    for (const section of group.items) {
      const item = section.children.find((child) => isPathMatchingMenuPath(path, child.path));
      if (item) {
        return { group, section, item };
      }
    }
  }

  return null;
}
