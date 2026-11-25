import { NextRequest, NextResponse } from "next/server";
import { getAdmin, sameOrigin } from "@/lib/auth";
import { ImportFileError, importBatch, type UploadFile } from "@/lib/import-service";

export const runtime = "nodejs";
const MAX_FILE_BYTES = 15 * 1024 * 1024;

async function upload(form: FormData, key: string, extension: string): Promise<UploadFile> {
  const value = form.get(key);
  if (!(value instanceof File)) throw new ImportFileError(`请上传${key}文件`);
  if (!value.name.toLowerCase().endsWith(extension)) throw new ImportFileError(`${key}文件格式应为 ${extension}`);
  if (!value.size || value.size > MAX_FILE_BYTES) throw new ImportFileError(`${key}文件大小须在 1 字节至 15 MB 之间`);
  return { name: value.name, bytes: Buffer.from(await value.arrayBuffer()) };
}

export async function POST(request: NextRequest) {
  if (!(await sameOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "请先登录管理员账号" }, { status: 401 });
  try {
    const form = await request.formData();
    const files = {
      software: await upload(form, "software", ".xlsx"),
      usage: await upload(form, "usage", ".csv"),
      rules: await upload(form, "rules", ".csv"),
    };
    const result = await importBatch(files, admin.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ImportFileError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("import failed", error);
    return NextResponse.json({ error: "导入失败，请检查服务日志" }, { status: 500 });
  }
}
