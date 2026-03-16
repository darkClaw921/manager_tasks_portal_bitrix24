'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { BottomTabs } from '@/components/layout/BottomTabs';
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar - visible on desktop, overlay on mobile */}
      <Sidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <Header />

        {/* Content area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>

        {/* Bottom tabs - mobile only */}
        <BottomTabs />
      </div>

      {/* Create Task Modal - accessible from Header button */}
      <CreateTaskModal />
    </div>
  );
}
