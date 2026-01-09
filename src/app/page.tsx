'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  FolderOpen,
  BarChart3,
} from 'lucide-react'

interface StatCardProps {
  title: string
  value: string
  description: string
  icon: React.ReactNode
  bgColor: string
  trend?: {
    value: number
    isPositive: boolean
  }
}

function StatCard({ title, value, description, icon, bgColor, trend }: StatCardProps) {
  return (
    <Card className={bgColor}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="rounded-lg bg-white/50 p-2">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {trend && (
            <span
              className={`flex items-center gap-1 ${
                trend.isPositive ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {trend.isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {trend.value}%
            </span>
          )}
          <span>{description}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()

  const stats = [
    {
      title: 'Total Investment',
      value: '$2,450,000',
      description: 'from last month',
      icon: <DollarSign className="h-4 w-4 text-slate-600" />,
      bgColor: 'bg-slate-100',
      trend: { value: 12.5, isPositive: true },
    },
    {
      title: 'Active Projects',
      value: '24',
      description: 'across all portfolios',
      icon: <FolderOpen className="h-4 w-4 text-slate-600" />,
      bgColor: 'bg-slate-100',
      trend: { value: 4.2, isPositive: true },
    },
    {
      title: 'Team Members',
      value: '12',
      description: 'active users',
      icon: <Users className="h-4 w-4 text-slate-600" />,
      bgColor: 'bg-slate-100',
      trend: { value: 2, isPositive: true },
    },
    {
      title: 'ROI',
      value: '18.2%',
      description: 'year to date',
      icon: <BarChart3 className="h-4 w-4 text-slate-600" />,
      bgColor: 'bg-slate-100',
      trend: { value: 3.1, isPositive: true },
    },
  ]

  return (
    <div className="space-y-6">
      {/* Welcome section */}
      <div>
        <h2 className="text-2xl font-bold">
          Welcome back, {user?.name?.split(' ')[0]}!
        </h2>
        <p className="text-muted-foreground">
          Here&apos;s an overview of your investment portfolio.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Recent activity section */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-slate-100">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest updates from your portfolio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { title: 'New investment added', time: '2 hours ago', type: 'investment' },
                { title: 'Quarterly report generated', time: '5 hours ago', type: 'report' },
                { title: 'Team member invited', time: '1 day ago', type: 'team' },
                { title: 'Portfolio rebalanced', time: '2 days ago', type: 'portfolio' },
              ].map((activity, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between pb-3 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">{activity.title}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                  <div className="rounded-full bg-white px-2 py-1 text-xs">
                    {activity.type}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-100">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Add Investment', icon: <DollarSign className="h-4 w-4" /> },
                { label: 'Create Project', icon: <FolderOpen className="h-4 w-4" /> },
                { label: 'View Reports', icon: <BarChart3 className="h-4 w-4" /> },
                { label: 'Invite Member', icon: <Users className="h-4 w-4" /> },
              ].map((action, index) => (
                <button
                  key={index}
                  className="flex items-center gap-2 rounded-lg bg-white p-3 text-sm font-medium transition-colors hover:bg-slate-100"
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
