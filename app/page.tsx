import Platform from "@/components/platform";
import { isDemo } from "@/lib/db";
export const dynamic = "force-dynamic";
export default function Page() {
  return <Platform demoEnabled={isDemo()} />;
}
