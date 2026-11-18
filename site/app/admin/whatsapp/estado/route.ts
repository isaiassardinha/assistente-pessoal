import { ehAdminCom2fa } from "@/lib/auth/sessao";
import { estadoDoRobo } from "@/lib/robo";

/** Estado da conexão do WhatsApp (só administrador com 2FA). Usado pela tela que atualiza sozinha. */
export async function GET() {
  if (!(await ehAdminCom2fa())) return Response.json({ erro: "não autorizado" }, { status: 401 });
  return Response.json(await estadoDoRobo(), { headers: { "Cache-Control": "no-store" } });
}
