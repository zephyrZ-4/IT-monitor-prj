import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { AdminLogin } from "@/components/admin-login";
import { getAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getAdmin()) redirect("/admin");
  return <Shell title="管理员登录" subtitle="仅管理员可导入数据和处理工单"><AdminLogin/></Shell>;
}
