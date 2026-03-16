'use client';

/**
 * Offline fallback page.
 * Displayed when the user is offline and the requested page is not cached.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Offline icon */}
        <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="text-h2 font-bold text-slate-900 mb-2">
          Нет подключения к сети
        </h1>

        <p className="text-body text-slate-500 mb-8">
          Проверьте подключение к интернету и попробуйте снова.
          Ранее просмотренные страницы могут быть доступны из кэша.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => window.location.reload()}
            className="w-full px-4 py-3 bg-primary text-white rounded-input font-medium hover:bg-blue-700 transition-colors"
          >
            Попробовать снова
          </button>

          <button
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                window.location.href = '/dashboard';
              }
            }}
            className="w-full px-4 py-3 bg-slate-100 text-slate-700 rounded-input font-medium hover:bg-slate-200 transition-colors"
          >
            Назад
          </button>
        </div>

        <p className="mt-8 text-xs text-slate-400">
          TaskHub работает в автономном режиме с ограниченной функциональностью
        </p>
      </div>
    </div>
  );
}
