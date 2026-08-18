/**
 * Минимальный layout для /service-portal.
 * НЕ использует AppShell — admin-панель отделена от основного сайта.
 */
export default function ServicePortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-8">
      {children}
    </div>
  );
}
