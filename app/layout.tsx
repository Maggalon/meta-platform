import type { Metadata } from "next";
import "./globals.css";
import "./readability.css";
export const metadata: Metadata = {
  title: "Meta Education — пространство для роста",
  description:
    "Подготовка к ЕГЭ: задания, обратная связь и прогресс в одном пространстве.",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
