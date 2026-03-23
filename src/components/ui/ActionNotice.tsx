/* Плавающее уведомление-тост для действий (auth, отзывы и т.д.) */
export function ActionNotice({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 max-w-sm rounded-card border border-line bg-panel px-4 py-3 text-sm font-medium text-ink shadow-floating"
    >
      {message}
    </div>
  );
}
