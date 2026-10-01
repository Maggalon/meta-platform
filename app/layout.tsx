import type { Metadata } from "next";
import "./globals.css";
import "./readability.css";
import "./workbook.css";
import "./compass.css";
import "./diary.css";
import "./mind-map.css";
import "./odyssey.css";
import "./failure-journal.css";
import "./spaces.css";
import "./access.css";
export const metadata: Metadata = {
  title: "Meta Education — пространство для роста",
  description:
    "Подготовка к ЕГЭ: задания, обратная связь и прогресс в одном пространстве.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
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
