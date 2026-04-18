import { useEffect, useMemo, useState } from 'react';
import ContentSection from '../components/ContentSection.jsx';
import DataTable from '../components/DataTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingState from '../components/LoadingState.jsx';
import ModalForm from '../components/ModalForm.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatCard from '../components/StatCard.jsx';
import BarSummaryChart from '../components/charts/BarSummaryChart.jsx';
import DonutSummaryChart from '../components/charts/DonutSummaryChart.jsx';
import { iconMap } from '../components/iconMap.js';
import { findMenuItemByPath, getMenuGroupsByRole } from '../config/menuConfig.js';
import QuizManagementSection from './QuizManagementSection.jsx';
import BlankQuizBuilderSection from './BlankQuizBuilderSection.jsx';
import RolePermissionSection from './RolePermissionSection.jsx';
import RoomManagementSection from './RoomManagementSection.jsx';
import AttemptManagementSection from './AttemptManagementSection.jsx';
import UserManagementSection from './UserManagementSection.jsx';
import { getAdminDashboardSummary, getTeacherDashboardSummary } from '../../services/api.js';

const { AlertTriangle, Bell, CheckCircle2, ClipboardCheck, Building2, Users, BarChart3, Clock3 } = iconMap;

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function buildAdminMetricCards(metrics, progress) {
  return [
    { key: 'total_users', title: 'Total Users', value: metrics.total_users ?? 0, icon: Users, accent: 'blue', progress: progress.total_users ?? 0 },
    { key: 'total_teachers', title: 'Total Teachers', value: metrics.total_teachers ?? 0, icon: Users, accent: 'green', progress: progress.total_teachers ?? 0 },
    { key: 'total_students', title: 'Total Students', value: metrics.total_students ?? 0, icon: Users, accent: 'gold', progress: progress.total_students ?? 0 },
    { key: 'total_quizzes', title: 'Total Quizzes', value: metrics.total_quizzes ?? 0, icon: ClipboardCheck, accent: 'blue', progress: progress.total_quizzes ?? 0 },
    { key: 'total_rooms', title: 'Total Rooms', value: metrics.total_rooms ?? 0, icon: Building2, accent: 'blue', progress: progress.total_rooms ?? 0 },
    { key: 'active_sessions', title: 'Active Sessions', value: metrics.active_sessions ?? 0, icon: Clock3, accent: 'green', progress: progress.active_sessions ?? 0 },
    { key: 'suspicious_activities', title: 'Suspicious Activities', value: metrics.suspicious_activities ?? 0, icon: AlertTriangle, accent: 'red', progress: progress.suspicious_activities ?? 0 },
    { key: 'reports_summary', title: 'Reports Summary', value: metrics.reports_summary ?? 0, icon: BarChart3, accent: 'blue', progress: progress.reports_summary ?? 0 }
  ];
}

function buildTeacherMetricCards(metrics, progress) {
  return [
    { key: 'total_quizzes', title: 'Total Quizzes', value: metrics.total_quizzes ?? 0, icon: ClipboardCheck, accent: 'blue', progress: progress.total_quizzes ?? 0 },
    { key: 'active_quizzes', title: 'Active Quizzes', value: metrics.active_quizzes ?? 0, icon: Clock3, accent: 'green', progress: progress.active_quizzes ?? 0 },
    { key: 'total_students', title: 'Total Students', value: metrics.total_students ?? 0, icon: Users, accent: 'gold', progress: progress.total_students ?? 0 },
    { key: 'total_rooms', title: 'Total Rooms', value: metrics.total_rooms ?? 0, icon: Building2, accent: 'blue', progress: progress.total_rooms ?? 0 }
  ];
}

function DashboardPageContent({ role, currentPath, onNavigate }) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const menuGroups = useMemo(() => getMenuGroupsByRole(role), [role]);
  const current = useMemo(() => findMenuItemByPath(menuGroups, currentPath), [menuGroups, currentPath]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const response = role === 'admin' ? await getAdminDashboardSummary() : await getTeacherDashboardSummary();
        if (active) {
          setData(response);
        }
      } catch (err) {
        if (active) {
          setError(err?.data?.message || 'Failed to load dashboard data.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [role]);

  if (!current) {
    return <EmptyState title="Page not found" description="This route is not configured for your role." />;
  }

  if (loading) {
    return <LoadingState text="Loading real dashboard data..." />;
  }

  if (error) {
    return (
      <ContentSection title="Data Error" subtitle="Unable to load dashboard data right now.">
        <p className="text-sm text-red-600">{error}</p>
      </ContentSection>
    );
  }

  const { item } = current;

  const adminMetrics = buildAdminMetricCards(data?.metrics ?? {}, data?.progress ?? {});
  const teacherMetrics = buildTeacherMetricCards(data?.metrics ?? {}, data?.progress ?? {});
  const adminDonutSegments = [
    { label: 'Quizzes', value: Number(data?.metrics?.total_quizzes ?? 0), color: '#1E3A8A' },
    { label: 'Sessions', value: Number(data?.metrics?.active_sessions ?? 0), color: '#1F8A4C' },
    { label: 'Suspicious', value: Number(data?.metrics?.suspicious_activities ?? 0), color: '#F2C200' }
  ];
  const adminBars = [
    { label: 'Users', value: Number(data?.metrics?.total_users ?? 0), color: '#1E3A8A' },
    { label: 'Teachers', value: Number(data?.metrics?.total_teachers ?? 0), color: '#1F8A4C' },
    { label: 'Students', value: Number(data?.metrics?.total_students ?? 0), color: '#3b82f6' },
    { label: 'Quizzes', value: Number(data?.metrics?.total_quizzes ?? 0), color: '#2563eb' },
    { label: 'Rooms', value: Number(data?.metrics?.total_rooms ?? 0), color: '#60a5fa' }
  ];
  const teacherDonutSegments = [
    { label: 'Total Quizzes', value: Number(data?.metrics?.total_quizzes ?? 0), color: '#1E3A8A' },
    { label: 'Active Quizzes', value: Number(data?.metrics?.active_quizzes ?? 0), color: '#1F8A4C' },
    { label: 'Rooms', value: Number(data?.metrics?.total_rooms ?? 0), color: '#F2C200' }
  ];
  const teacherBars = [
    { label: 'Quizzes', value: Number(data?.metrics?.total_quizzes ?? 0), color: '#1E3A8A' },
    { label: 'Active', value: Number(data?.metrics?.active_quizzes ?? 0), color: '#1F8A4C' },
    { label: 'Students', value: Number(data?.metrics?.total_students ?? 0), color: '#3b82f6' },
    { label: 'Rooms', value: Number(data?.metrics?.total_rooms ?? 0), color: '#60a5fa' }
  ];

  const activityList = data?.recent_activity ?? [];
  const notifications = data?.recent_notifications ?? data?.announcements ?? [];

  const resultRows = (data?.recent_quiz_results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    score: row.score,
    time: formatDate(row.time),
    status: row.score >= 50 ? 'completed' : 'pending'
  }));

  const attemptRows = (data?.recent_student_attempts ?? []).map((row) => ({
    id: row.id,
    student: row.student,
    quiz: row.quiz,
    status: row.status,
    risk_level: row.risk_level,
    time: formatDate(row.time)
  }));

  const resultColumns = [
    { key: 'title', label: 'Quiz' },
    { key: 'score', label: 'Score' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'time', label: 'Created At' }
  ];

  const attemptColumns = [
    { key: 'student', label: 'Student' },
    { key: 'quiz', label: 'Quiz' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'risk_level', label: 'Risk Level' },
    { key: 'time', label: 'Created At' }
  ];

  const renderOverview = () => {
    if (role === 'admin') {
      return (
        <div className="space-y-6">
          <PageHeader title="Admin Overview" subtitle="Real-time system metrics from your database." />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {adminMetrics.map((card) => (
              <StatCard
                key={card.key}
                title={card.title}
                value={card.value}
                icon={card.icon}
                accent={card.accent}
                progress={card.progress}
              />
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <DonutSummaryChart
              title="Distribution"
              centerValue={Number(data?.progress?.reports_summary ?? 0)}
              segments={adminDonutSegments}
            />
            <BarSummaryChart title="Analytics" items={adminBars} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <ContentSection title="Recent Activity" subtitle="Latest actions from audit/system logs.">
              {activityList.length === 0 ? (
                <EmptyState title="No activity available" description="No recent activity records found in the database." />
              ) : (
                <ul className="space-y-2">
                  {activityList.map((activity) => (
                    <li key={activity.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                      <p className="text-sm font-medium text-slate-800">{activity.title}</p>
                      <p className="text-xs text-slate-500">{activity.meta}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDate(activity.time)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </ContentSection>

            <ContentSection title="Recent Notifications" subtitle="Most recent notification records.">
              {notifications.length === 0 ? (
                <EmptyState title="No notifications" description="No notifications found in the database." />
              ) : (
                <ul className="space-y-2">
                  {notifications.map((notification) => (
                    <li key={notification.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                      <p className="text-sm font-medium text-slate-800">{notification.title}</p>
                      <p className="text-xs text-slate-500">{notification.message}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDate(notification.time)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </ContentSection>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <PageHeader title="Teacher Overview" subtitle="Your quiz and room metrics from live database records." />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {teacherMetrics.map((card) => (
            <StatCard
              key={card.key}
              title={card.title}
              value={card.value}
              icon={card.icon}
              accent={card.accent}
              progress={card.progress}
            />
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <DonutSummaryChart
            title="Quiz Distribution"
            centerValue={Number(data?.progress?.total_quizzes ?? 0)}
            segments={teacherDonutSegments}
          />
          <BarSummaryChart title="Teacher Analytics" items={teacherBars} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <ContentSection title="Recent Quiz Results" subtitle="Latest quiz results for your quizzes.">
            {resultRows.length === 0 ? <EmptyState title="No quiz results" description="No quiz result rows found yet." /> : <DataTable columns={resultColumns} rows={resultRows} />}
          </ContentSection>
          <ContentSection title="Recent Student Attempts" subtitle="Most recent attempt activity in your quizzes.">
            {attemptRows.length === 0 ? <EmptyState title="No attempts" description="No student attempts found yet." /> : <DataTable columns={attemptColumns} rows={attemptRows} />}
          </ContentSection>
        </div>

        <ContentSection title="Announcements" subtitle="Latest announcements for teachers.">
          {notifications.length === 0 ? (
            <EmptyState title="No announcements" description="No announcement records found." />
          ) : (
            <ul className="space-y-2">
              {notifications.map((notification) => (
                <li key={notification.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <p className="text-sm font-medium text-slate-800">{notification.title}</p>
                  <p className="text-xs text-slate-500">{notification.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDate(notification.time)}</p>
                </li>
              ))}
            </ul>
          )}
        </ContentSection>
      </div>
    );
  };

  const renderStats = () => (
    <div className="space-y-6">
      <PageHeader title={item.label} subtitle="Summary metrics from real backend counts." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(role === 'admin' ? adminMetrics : teacherMetrics).map((card) => (
          <StatCard
            key={card.key}
            title={card.title}
            value={card.value}
            icon={card.icon}
            accent={card.accent}
            progress={card.progress}
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DonutSummaryChart
          title="Distribution"
          centerValue={Number(data?.progress?.reports_summary ?? data?.progress?.total_quizzes ?? 0)}
          segments={role === 'admin' ? adminDonutSegments : teacherDonutSegments}
        />
        <BarSummaryChart title="Analytics" items={role === 'admin' ? adminBars : teacherBars} />
      </div>
    </div>
  );

  const renderActivity = () => (
    <div className="space-y-6">
      <PageHeader title={item.label} subtitle="Timeline from real activity tables." />
      <ContentSection title="Activity Timeline" subtitle="Most recent events">
        {activityList.length === 0 ? (
          <EmptyState title="No recent activity" description="No activity found in audit/system logs." />
        ) : (
          <ul className="space-y-2">
            {activityList.map((activity) => (
              <li key={activity.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <p className="text-sm font-medium text-slate-800">{activity.title}</p>
                <p className="text-xs text-slate-500">{activity.meta}</p>
                <p className="mt-1 text-xs text-slate-400">{formatDate(activity.time)}</p>
              </li>
            ))}
          </ul>
        )}
      </ContentSection>
    </div>
  );

  const renderFullPageForm = () => (
    <div className="space-y-6">
      <PageHeader title={item.label} subtitle="Detailed data entry form." />
      <ContentSection title="Full Page Form" subtitle="For detailed records and settings.">
        <form className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
            <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
            <select className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100">
              <option>Select category</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
            <textarea className="h-32 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100" />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600">Cancel</button>
            <button type="button" className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1F8A4C]">Save</button>
          </div>
        </form>
      </ContentSection>
    </div>
  );

  const renderGeneric = () => (
    <div className="space-y-6">
      <PageHeader title={item.label} subtitle="Connected section ready for real records." />
      <ContentSection title={item.label} subtitle="No fabricated data is shown.">
        <EmptyState title="No data available" description="No records found for this section yet." />
      </ContentSection>
    </div>
  );

  let content;
  const usesCustomSection =
    (role === 'admin' &&
      (currentPath.startsWith('/admin/users') ||
        currentPath.startsWith('/admin/roles') ||
        currentPath.startsWith('/admin/quizzes') ||
        currentPath.startsWith('/admin/rooms') ||
        currentPath.startsWith('/admin/attempts'))) ||
    (role === 'teacher' &&
      (currentPath.startsWith('/teacher/quizzes') ||
        currentPath.startsWith('/teacher/rooms') ||
        currentPath.startsWith('/teacher/attempts')));

  if (role === 'admin' && currentPath.startsWith('/admin/users')) content = <UserManagementSection currentPath={currentPath} onNavigate={onNavigate} />;
  else if (role === 'admin' && currentPath.startsWith('/admin/roles')) {
    content = <RolePermissionSection currentPath={currentPath} onNavigate={onNavigate} />;
  }
  else if (
    (role === 'admin' && currentPath.startsWith('/admin/rooms')) ||
    (role === 'teacher' && currentPath.startsWith('/teacher/rooms'))
  ) {
    content = <RoomManagementSection role={role} currentPath={currentPath} onNavigate={onNavigate} />;
  }
  else if (
    (role === 'admin' && currentPath.startsWith('/admin/attempts')) ||
    (role === 'teacher' && currentPath.startsWith('/teacher/attempts'))
  ) {
    content = <AttemptManagementSection role={role} currentPath={currentPath} onNavigate={onNavigate} />;
  }
  else if (
    (role === 'admin' && currentPath.startsWith('/admin/quizzes/questions')) ||
    (role === 'teacher' && currentPath.startsWith('/teacher/quizzes/questions'))
  ) {
    content = <BlankQuizBuilderSection role={role} currentPath={currentPath} onNavigate={onNavigate} />;
  }
  else if ((role === 'admin' && currentPath.startsWith('/admin/quizzes')) || (role === 'teacher' && currentPath.startsWith('/teacher/quizzes'))) {
    content = <QuizManagementSection role={role} currentPath={currentPath} onNavigate={onNavigate} />;
  }
  else if (item.view === 'overview') content = renderOverview();
  else if (item.view === 'stats') content = renderStats();
  else if (item.view === 'activity') content = renderActivity();
  else if (item.view === 'fullPageForm') content = renderFullPageForm();
  else content = renderGeneric();

  return (
    <>
      {content}
      {item.view === 'modalForm' && showModal && !usesCustomSection ? (
        <ModalForm
          title={`${item.label} - Quick Form`}
          onClose={() => setShowModal(false)}
          fields={[
            { name: 'name', label: 'Name', placeholder: 'Enter name' },
            { name: 'details', label: 'Details', placeholder: 'Enter details' }
          ]}
        />
      ) : null}

      {item.view === 'modalForm' && !usesCustomSection ? (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="fixed bottom-6 right-6 rounded-full bg-[#1E3A8A] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#1F8A4C]"
        >
          Open Quick Form
        </button>
      ) : null}
    </>
  );
}

export default DashboardPageContent;
