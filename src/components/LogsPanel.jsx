import { Bell, ClipboardList } from 'lucide-react'

export function LogsPanel({ logs = [] }) {
  const sortedLogs = [...logs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const recentLogs = sortedLogs.slice(0, 8)
  const notifications = sortedLogs.filter((log) => log.category === 'alert').slice(0, 6)

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Notifications and Audit</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Notification Center</h2>
        </div>
        <Bell className="h-5 w-5 text-cyan-300" />
      </div>

      <div className="mb-5 overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-black/30 text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Recipient</th>
              <th className="px-4 py-3 font-medium">Timestamp</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {notifications.length ? (
              notifications.map((notification) => (
                <tr key={notification.id} className="text-zinc-300">
                  <td className="px-4 py-3 font-medium text-white">{notification.type}</td>
                  <td className="px-4 py-3">{notification.recipient}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(notification.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-zinc-200">
                      {notification.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{notification.message}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="px-4 py-4 text-zinc-500">
                  No active notifications for this batch.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h3 className="mb-3 text-sm font-semibold text-white">Audit Trail</h3>

      {recentLogs.length ? (
        <div className="space-y-3">
          {recentLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/20 p-3"
            >
              <ClipboardList className="mt-1 h-4 w-4 text-cyan-300" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-zinc-300">
                    {log.level}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-300">{log.message}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
          No notification or audit logs for this batch yet.
        </p>
      )}
    </section>
  )
}
